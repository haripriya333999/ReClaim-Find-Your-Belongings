import os
from datetime import datetime, timezone
from functools import wraps

import jwt
from bson import ObjectId
from bson.errors import InvalidId
from flask import Flask, jsonify, request, send_from_directory, send_file
from gridfs import GridFS
from pymongo import MongoClient, DESCENDING
from pymongo.errors import DuplicateKeyError
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from io import BytesIO
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')
load_dotenv(os.path.join(BASE_DIR, '.env'))

MONGO_URI = os.getenv('MONGO_URI', '').strip()
JWT_SECRET = os.getenv('JWT_SECRET', '').strip()
DB_NAME = os.getenv('DB_NAME', 'reclaim_db')
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = MAX_IMAGE_BYTES + 1024 * 1024

if not MONGO_URI:
    raise RuntimeError('MONGO_URI is missing. Add your MongoDB Atlas connection string to the project .env file.')
if not JWT_SECRET or len(JWT_SECRET) < 32:
    raise RuntimeError('JWT_SECRET is missing or too short. Set a random secret of at least 32 characters in .env.')

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
db = client[DB_NAME]
users = db['users']
items = db['items']
fs = GridFS(db)

# Indexes are safe to create repeatedly and improve lookups.
users.create_index('email', unique=True)
items.create_index([('reportType', 1), ('status', 1), ('createdAt', DESCENDING)])
items.create_index([('userId', 1), ('createdAt', DESCENDING)])


def now_utc():
    return datetime.now(timezone.utc)


def json_item(doc):
    return {
        '_id': str(doc['_id']),
        'userId': str(doc['userId']),
        'reportType': doc['reportType'],
        'itemName': doc['itemName'],
        'category': doc['category'],
        'description': doc['description'],
        'color': doc['color'],
        'location': doc['location'],
        'date': doc['date'].isoformat(),
        'imageUrl': f"/api/items/image/{doc['imageId']}" if doc.get('imageId') else None,
        'status': doc['status'],
        'createdAt': doc['createdAt'].isoformat(),
        'updatedAt': doc['updatedAt'].isoformat(),
    }


def token_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify(success=False, message='Authentication token is required.'), 401
        token = auth.split(' ', 1)[1].strip()
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            user = users.find_one({'_id': ObjectId(payload['userId'])})
            if not user:
                return jsonify(success=False, message='User account was not found.'), 401
            request.current_user = user
        except (jwt.InvalidTokenError, KeyError, InvalidId):
            return jsonify(success=False, message='Invalid or expired authentication token.'), 401
        return fn(*args, **kwargs)
    return wrapper


def valid_text(data, key, label, max_length, required=True):
    value = data.get(key, '')
    if value is None:
        value = ''
    value = str(value).strip()
    if required and not value:
        raise ValueError(f'{label} is required.')
    if len(value) > max_length:
        raise ValueError(f'{label} must be {max_length} characters or fewer.')
    return value


def allowed_image(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.get('/')
def home():
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.get('/<path:filename>')
def frontend_files(filename):
    # Only serves files inside frontend; API paths are handled by their own routes.
    return send_from_directory(FRONTEND_DIR, filename)


@app.get('/api/health')
def health():
    try:
        client.admin.command('ping')
        return jsonify(success=True, message='ReClaim API and MongoDB connection are working.', database=DB_NAME)
    except Exception:
        app.logger.exception('Database health check failed')
        return jsonify(success=False, message='Database connection failed.'), 503


@app.post('/api/auth/register')
def register():
    data = request.get_json(silent=True) or {}
    try:
        name = valid_text(data, 'name', 'Name', 80)
        email = valid_text(data, 'email', 'Email', 254).lower()
        password = valid_text(data, 'password', 'Password', 128)
        if '@' not in email or '.' not in email.split('@')[-1]:
            return jsonify(success=False, message='Enter a valid email address.'), 400
        if len(password) < 8:
            return jsonify(success=False, message='Password must contain at least 8 characters.'), 400
        user = {
            'name': name,
            'email': email,
            'passwordHash': generate_password_hash(password),
            'createdAt': now_utc(),
        }
        result = users.insert_one(user)
        return jsonify(success=True, message='Registration successful. You can now log in.', userId=str(result.inserted_id)), 201
    except ValueError as exc:
        return jsonify(success=False, message=str(exc)), 400
    except DuplicateKeyError:
        return jsonify(success=False, message='An account with this email already exists.'), 409


@app.post('/api/auth/login')
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get('email', '')).strip().lower()
    password = str(data.get('password', ''))
    user = users.find_one({'email': email})
    if not user or not check_password_hash(user['passwordHash'], password):
        return jsonify(success=False, message='Incorrect email or password.'), 401
    token = jwt.encode(
        {'userId': str(user['_id']), 'exp': datetime.now(timezone.utc).timestamp() + 60 * 60 * 24},
        JWT_SECRET,
        algorithm='HS256'
    )
    return jsonify(success=True, token=token, user={'id': str(user['_id']), 'name': user['name'], 'email': user['email']})


@app.get('/api/auth/me')
@token_required
def me():
    user = request.current_user
    return jsonify(success=True, user={'id': str(user['_id']), 'name': user['name'], 'email': user['email']})


@app.post('/api/items')
@token_required
def create_item():
    data = request.form
    try:
        report_type = valid_text(data, 'reportType', 'Report type', 10).upper()
        if report_type not in {'LOST', 'FOUND'}:
            return jsonify(success=False, message='reportType must be LOST or FOUND.'), 400
        item_name = valid_text(data, 'itemName', 'Item name', 100)
        category = valid_text(data, 'category', 'Category', 60)
        description = valid_text(data, 'description', 'Description', 1000)
        color = valid_text(data, 'color', 'Color', 50)
        location = valid_text(data, 'location', 'Location', 200)
        date_text = valid_text(data, 'date', 'Date', 40)
        try:
            incident_date = datetime.fromisoformat(date_text.replace('Z', '+00:00'))
            if incident_date.tzinfo is None:
                incident_date = incident_date.replace(tzinfo=timezone.utc)
        except ValueError:
            return jsonify(success=False, message='Enter a valid incident date.'), 400

        image = request.files.get('image')
        if not image or not image.filename:
            return jsonify(success=False, message='Please upload an item photograph.'), 400
        filename = secure_filename(image.filename)
        if not allowed_image(filename):
            return jsonify(success=False, message='Image must be PNG, JPG, JPEG or WEBP.'), 400
        image_bytes = image.read(MAX_IMAGE_BYTES + 1)
        if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
            return jsonify(success=False, message='Image must be smaller than 5 MB.'), 400
        content_type = image.mimetype or 'application/octet-stream'
        if content_type not in {'image/png', 'image/jpeg', 'image/webp'}:
            return jsonify(success=False, message='Unsupported image content type.'), 400

        image_id = fs.put(BytesIO(image_bytes), filename=filename, contentType=content_type, ownerId=str(request.current_user['_id']))
        timestamp = now_utc()
        doc = {
            'userId': request.current_user['_id'],
            'reportType': report_type,
            'itemName': item_name,
            'category': category,
            'description': description,
            'color': color,
            'location': location,
            'date': incident_date,
            'imageId': image_id,
            'status': 'OPEN',
            'createdAt': timestamp,
            'updatedAt': timestamp,
        }
        result = items.insert_one(doc)
        doc['_id'] = result.inserted_id
        return jsonify(success=True, message=f'{report_type.title()} item report submitted successfully.', item=json_item(doc)), 201
    except ValueError as exc:
        return jsonify(success=False, message=str(exc)), 400
    except Exception:
        app.logger.exception('Could not create item report')
        return jsonify(success=False, message='Could not save the report. Please try again.'), 500


@app.get('/api/items')
@token_required
def list_items():
    report_type = request.args.get('reportType', '').upper().strip()
    status = request.args.get('status', '').upper().strip()
    query = {}
    if report_type:
        if report_type not in {'LOST', 'FOUND'}:
            return jsonify(success=False, message='reportType must be LOST or FOUND.'), 400
        query['reportType'] = report_type
    if status:
        if status not in {'OPEN', 'CLAIMED', 'RECLAIMED', 'CLOSED'}:
            return jsonify(success=False, message='Invalid status filter.'), 400
        query['status'] = status
    docs = items.find(query).sort('createdAt', DESCENDING).limit(200)
    return jsonify(success=True, count=items.count_documents(query), items=[json_item(doc) for doc in docs])


@app.get('/api/items/my-reports')
@token_required
def my_reports():
    docs = items.find({'userId': request.current_user['_id']}).sort('createdAt', DESCENDING)
    return jsonify(success=True, items=[json_item(doc) for doc in docs])


@app.get('/api/items/<item_id>')
@token_required
def get_item(item_id):
    try:
        doc = items.find_one({'_id': ObjectId(item_id)})
    except InvalidId:
        return jsonify(success=False, message='Invalid item ID.'), 400
    if not doc:
        return jsonify(success=False, message='Item report not found.'), 404
    return jsonify(success=True, item=json_item(doc))


@app.patch('/api/items/<item_id>/status')
@token_required
def update_item_status(item_id):
    try:
        oid = ObjectId(item_id)
    except InvalidId:
        return jsonify(success=False, message='Invalid item ID.'), 400
    data = request.get_json(silent=True) or {}
    status = str(data.get('status', '')).strip().upper()
    if status not in {'OPEN', 'CLAIMED', 'RECLAIMED', 'CLOSED'}:
        return jsonify(success=False, message='Status must be OPEN, CLAIMED, RECLAIMED or CLOSED.'), 400
    doc = items.find_one({'_id': oid})
    if not doc:
        return jsonify(success=False, message='Item report not found.'), 404
    # Member 1: owners may manage their own report. Member 3 can later receive
    # a dedicated recovery-service authorization after the team agrees on roles.
    if doc['userId'] != request.current_user['_id']:
        return jsonify(success=False, message='You can update only your own item reports.'), 403
    items.update_one({'_id': oid}, {'$set': {'status': status, 'updatedAt': now_utc()}})
    updated = items.find_one({'_id': oid})
    return jsonify(success=True, message='Report status updated.', item=json_item(updated))


@app.get('/api/items/image/<image_id>')
def get_item_image(image_id):
    try:
        file_obj = fs.get(ObjectId(image_id))
        response = send_file(BytesIO(file_obj.read()), mimetype=file_obj.content_type or 'application/octet-stream')
        response.headers['Cache-Control'] = 'public, max-age=3600'
        return response
    except (InvalidId, Exception):
        return jsonify(success=False, message='Image not found.'), 404


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify(success=False, message='Request is too large. Images must be smaller than 5 MB.'), 413


if __name__ == '__main__':
    # Check Atlas connectivity before starting the application.
    client.admin.command('ping')
    print(f'ReClaim backend connected to MongoDB database: {DB_NAME}')
    app.run(host='127.0.0.1', port=int(os.getenv('PORT', '5000')), debug=os.getenv('FLASK_DEBUG', 'false').lower() == 'true')
