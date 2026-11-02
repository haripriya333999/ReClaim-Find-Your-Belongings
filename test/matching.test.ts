import { calculateMatchScore, findPotentialMatches } from '../matching/engine.ts';
import { ItemRecord } from '../db/repository.ts';

function runTests() {
  console.log('====================================================');
  console.log('RECLAIM - MEMBER 2 SMART MATCHING 22-SCENARIO TEST SUITE');
  console.log('====================================================');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`✓ [PASS] Scenario ${total}: ${testName}${detail ? ` -> ${detail}` : ''}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] Scenario ${total}: ${testName}${detail ? ` -> ${detail}` : ''}`);
    }
  }

  const baseDate = new Date('2026-10-30T10:00:00.000Z');

  // Baseline standard items
  const lostWallet: ItemRecord = {
    _id: 'item_lost_wallet_101',
    userId: 'user_ananya',
    reportType: 'LOST',
    itemName: 'Wallet',
    category: 'Accessories',
    description: 'Black leather wallet with a small silver logo and college ID card inside.',
    color: 'Black',
    location: 'MVP Colony',
    date: '2026-10-30T09:00:00.000Z',
    imageId: 'img_1',
    status: 'OPEN',
    createdAt: baseDate.toISOString(),
    updatedAt: baseDate.toISOString(),
  };

  const foundWallet: ItemRecord = {
    _id: 'item_found_wallet_201',
    userId: 'user_rahul',
    reportType: 'FOUND',
    itemName: 'Wallet',
    category: 'Accessories',
    description: 'Black leather wallet found near sidewalk bench with silver logo.',
    color: 'Black',
    location: 'Near MVP Colony',
    date: '2026-10-30T10:00:00.000Z',
    imageId: 'img_2',
    status: 'OPEN',
    createdAt: baseDate.toISOString(),
    updatedAt: baseDate.toISOString(),
  };

  // ----------------------------------------------------
  // Scenario 1: Exact same item descriptions (>= 90%)
  // ----------------------------------------------------
  const identicalLost: ItemRecord = { ...lostWallet };
  const identicalFound: ItemRecord = { ...lostWallet, _id: 'item_found_identical', userId: 'user_rahul', reportType: 'FOUND' };
  const res1 = calculateMatchScore(identicalLost, identicalFound);
  assert(
    res1 !== null && res1.score >= 90 &&
    res1.breakdown.name.score === 20 &&
    res1.breakdown.category.score === 15 &&
    res1.breakdown.color.score === 15 &&
    res1.breakdown.date.score === 10,
    'Exact same item descriptions (Score >= 90%, 20/15/15/10 criterion scores)',
    `Score: ${res1?.score}%`
  );

  // ----------------------------------------------------
  // Scenario 2: Equivalent item-name synonyms (phone vs mobile)
  // ----------------------------------------------------
  const lostPhone: ItemRecord = {
    ...lostWallet,
    _id: 'item_phone_lost',
    itemName: 'Smartphone',
    category: 'Electronics',
    color: 'Navy Blue',
    description: 'Samsung Galaxy with cracked screen protector',
    location: 'Main Library 2nd Floor',
  };
  const foundMobile: ItemRecord = {
    ...foundWallet,
    _id: 'item_phone_found',
    itemName: 'Mobile Phone',
    category: 'Electronics',
    color: 'Blue',
    description: 'Samsung phone with protective screen glass',
    location: 'Near Main Library',
  };
  const res2 = calculateMatchScore(lostPhone, foundMobile);
  assert(
    res2 !== null && res2.breakdown.name.score >= 18,
    'Equivalent item-name synonyms ("Smartphone" vs "Mobile Phone" name score >= 18/20)',
    `Name score: ${res2?.breakdown.name.score}/20`
  );

  // ----------------------------------------------------
  // Scenario 3: Unrelated item names with similar words (black shoes vs black wallet <= 25%)
  // ----------------------------------------------------
  const foundShoes: ItemRecord = {
    ...foundWallet,
    _id: 'item_shoes_found',
    itemName: 'Black Shoes',
    category: 'Clothing',
    color: 'Black',
    description: 'Black leather running shoes size 9',
    location: 'MVP Colony',
  };
  const res3 = calculateMatchScore(lostWallet, foundShoes);
  assert(
    res3 !== null && res3.score <= 25 && res3.breakdown.name.score <= 5,
    'Unrelated item names sharing words ("Black Shoes" vs "Black Wallet" capped <= 25%)',
    `Overall score: ${res3?.score}%, Name: ${res3?.breakdown.name.score}/20`
  );

  // ----------------------------------------------------
  // Scenario 4: Similar colors with different objects (wallet vs handbag capped < 40%)
  // ----------------------------------------------------
  const foundHandbag: ItemRecord = {
    ...foundWallet,
    _id: 'item_handbag_found',
    itemName: 'Handbag',
    category: 'Accessories',
    color: 'Black',
    description: 'Black leather handbag found near bench',
    location: 'MVP Colony',
  };
  const res4 = calculateMatchScore(lostWallet, foundHandbag);
  assert(
    res4 !== null && res4.score < 40 && res4.score <= 22 && (res4.contradictions?.length ?? 0) > 0,
    'Similar colors with different objects ("Wallet" vs "Handbag" capped < 40% with contradiction shield)',
    `Score: ${res4?.score}%, Contradictions: ${res4?.contradictions?.join('; ')}`
  );

  // ----------------------------------------------------
  // Scenario 5: Distinct color conflicts (red vs blue -> 0 pts + contradiction)
  // ----------------------------------------------------
  const redBottle: ItemRecord = {
    ...lostWallet,
    _id: 'item_bottle_lost',
    itemName: 'Water Bottle',
    category: 'Accessories',
    color: 'Red',
    description: 'Stainless steel bottle',
  };
  const blueBottle: ItemRecord = {
    ...foundWallet,
    _id: 'item_bottle_found',
    itemName: 'Water Bottle',
    category: 'Accessories',
    color: 'Blue',
    description: 'Stainless steel bottle',
  };
  const res5 = calculateMatchScore(redBottle, blueBottle);
  assert(
    res5 !== null && res5.breakdown.color.score === 0 && (res5.contradictions?.some(c => c.toLowerCase().includes('colour conflict')) ?? false),
    'Distinct color conflicts (Red vs Blue yields 0/15 pts and logs colour conflict contradiction)',
    `Color score: ${res5?.breakdown.color.score}/15`
  );

  // ----------------------------------------------------
  // Scenario 6: Missing color information (neutral baseline, not 0 penalty)
  // ----------------------------------------------------
  const noColorLost: ItemRecord = { ...lostWallet, color: '' };
  const res6 = calculateMatchScore(noColorLost, foundWallet);
  assert(
    res6 !== null && res6.breakdown.color.score === 7,
    'Missing color information handled with neutral baseline (7/15 pts), avoiding harsh false penalty',
    `Color score: ${res6?.breakdown.color.score}/15`
  );

  // ----------------------------------------------------
  // Scenario 7: Similar descriptions with different objects
  // ----------------------------------------------------
  const lostWatchDesk: ItemRecord = {
    ...lostWallet,
    _id: 'item_watch_desk',
    itemName: 'Wristwatch',
    category: 'Accessories',
    color: 'Silver',
    description: 'Left on reading table 4 in college library next to textbook',
    location: 'College Library',
  };
  const foundPhoneDesk: ItemRecord = {
    ...foundWallet,
    _id: 'item_phone_desk',
    itemName: 'Smartphone',
    category: 'Electronics',
    color: 'Silver',
    description: 'Found on reading table 4 in college library next to textbook',
    location: 'College Library',
  };
  const res7 = calculateMatchScore(lostWatchDesk, foundPhoneDesk);
  assert(
    res7 !== null && res7.score < 40 && (res7.contradictions?.length ?? 0) > 0,
    'Similar descriptions with different objects ("Watch" vs "Smartphone" desk overlap capped < 40%)',
    `Score: ${res7?.score}%, Contradictions: ${res7?.contradictions?.join('; ')}`
  );

  // ----------------------------------------------------
  // Scenario 8: Descriptions containing matching distinctive details ("star sticker" / "college id")
  // ----------------------------------------------------
  const lostWithSticker: ItemRecord = {
    ...lostWallet,
    description: 'Blue laptop with a distinct star sticker on the corner lid and scratch.',
    itemName: 'Laptop',
    category: 'Electronics',
    color: 'Blue',
  };
  const foundWithSticker: ItemRecord = {
    ...foundWallet,
    description: 'Found blue laptop having a shiny star sticker on corner.',
    itemName: 'Laptop',
    category: 'Electronics',
    color: 'Blue',
  };
  const res8 = calculateMatchScore(lostWithSticker, foundWithSticker);
  assert(
    res8 !== null && res8.breakdown.description.score >= 16,
    'Matching distinctive detail ("star sticker") triggers high-confidence description boost (>= 16/20)',
    `Desc score: ${res8?.breakdown.description.score}/20, Note: ${res8?.breakdown.description.note}`
  );

  // ----------------------------------------------------
  // Scenario 9: Conflicting brands (Apple vs Samsung -> brand conflict)
  // ----------------------------------------------------
  const lostApplePhone: ItemRecord = {
    ...lostPhone,
    description: 'Apple iPhone 14 Pro Max space gray with silicone case',
    itemName: 'Phone',
  };
  const foundSamsungPhone: ItemRecord = {
    ...foundMobile,
    description: 'Samsung Galaxy S23 Ultra dark phone with case',
    itemName: 'Phone',
  };
  const res9 = calculateMatchScore(lostApplePhone, foundSamsungPhone);
  assert(
    res9 !== null && (res9.contradictions?.some(c => c.toLowerCase().includes('brand conflict')) ?? false),
    'Conflicting brands (Apple vs Samsung) logs explicit Brand conflict and caps description score',
    `Contradictions: ${res9?.contradictions?.join('; ')}, Desc: ${res9?.breakdown.description.score}/20`
  );

  // ----------------------------------------------------
  // Scenario 10: Different materials (leather vs canvas)
  // ----------------------------------------------------
  const lostLeatherWallet: ItemRecord = {
    ...lostWallet,
    description: 'Genuine leather billfold wallet with card slots',
  };
  const foundCanvasWallet: ItemRecord = {
    ...foundWallet,
    description: 'Rough canvas fabric wallet with velcro strip',
  };
  const res10 = calculateMatchScore(lostLeatherWallet, foundCanvasWallet);
  assert(
    res10 !== null && (res10.contradictions?.some(c => c.toLowerCase().includes('material difference')) ?? false),
    'Different materials (leather vs canvas) registers material difference and penalizes score',
    `Contradictions: ${res10?.contradictions?.join('; ')}`
  );

  // ----------------------------------------------------
  // Scenario 11: Different locations (0 location points)
  // ----------------------------------------------------
  const lostCampus: ItemRecord = { ...lostWallet, location: 'College Library, Reading Room' };
  const foundFarAway: ItemRecord = { ...foundWallet, location: 'Gajuwaka Junction Bus Stop' };
  const res11 = calculateMatchScore(lostCampus, foundFarAway);
  assert(
    res11 !== null && res11.breakdown.location.score === 0,
    'Completely different locations ("College Library" vs "Gajuwaka") gets 0/20 location points',
    `Location score: ${res11?.breakdown.location.score}/20`
  );

  // ----------------------------------------------------
  // Scenario 12: Same location described differently ("College Library" vs "Near College Library")
  // ----------------------------------------------------
  const foundNearbyCampus: ItemRecord = { ...foundWallet, location: 'Near College Library' };
  const res12 = calculateMatchScore(lostCampus, foundNearbyCampus);
  assert(
    res12 !== null && res12.breakdown.location.score >= 14,
    'Same location described differently retains place tokens and recognizes proximity (>= 14/20)',
    `Location score: ${res12?.breakdown.location.score}/20`
  );

  // ----------------------------------------------------
  // Scenario 13: Reasonable date differences (same day 10/10, next day 9/10, 3 days 8/10)
  // ----------------------------------------------------
  const res13_0 = calculateMatchScore(lostWallet, { ...foundWallet, date: '2026-10-30T10:00:00.000Z' });
  const res13_1 = calculateMatchScore(lostWallet, { ...foundWallet, date: '2026-10-31T10:00:00.000Z' });
  const res13_3 = calculateMatchScore(lostWallet, { ...foundWallet, date: '2026-11-02T10:00:00.000Z' });
  const res13_7 = calculateMatchScore(lostWallet, { ...foundWallet, date: '2026-11-06T10:00:00.000Z' });
  assert(
    res13_0?.breakdown.date.score === 10 &&
    res13_1?.breakdown.date.score === 9 &&
    res13_3?.breakdown.date.score === 8 &&
    res13_7?.breakdown.date.score === 5,
    'Reasonable date differences (same day: 10/10, 24h: 9/10, 3 days: 8/10, 1 week: 5/10)',
    `Scores: ${res13_0?.breakdown.date.score}, ${res13_1?.breakdown.date.score}, ${res13_3?.breakdown.date.score}, ${res13_7?.breakdown.date.score}`
  );

  // ----------------------------------------------------
  // Scenario 14: Invalid or unparseable dates (safe 0 pts / neutral, no crash)
  // ----------------------------------------------------
  const foundBadDate: ItemRecord = { ...foundWallet, date: 'invalid-iso-date-string' };
  const res14 = calculateMatchScore(lostWallet, foundBadDate);
  assert(
    res14 !== null && res14.breakdown.date.score === 0,
    'Invalid or unparseable dates handled safely without runtime error (0/10 pts)',
    `Date score: ${res14?.breakdown.date.score}/10`
  );

  // ----------------------------------------------------
  // Scenario 15: Incomplete reports (missing description / location / color / date handled neutrally)
  // ----------------------------------------------------
  const incompleteLost: ItemRecord = {
    ...lostWallet,
    description: '',
    color: '',
    location: '',
    date: '',
  };
  const incompleteFound: ItemRecord = {
    ...foundWallet,
    description: '',
    color: '',
    location: '',
    date: '',
  };
  const res15 = calculateMatchScore(incompleteLost, incompleteFound);
  assert(
    res15 !== null &&
    !isNaN(res15.score) &&
    res15.breakdown.color.score === 7 &&
    res15.breakdown.description.score === 6 &&
    res15.breakdown.location.score === 8 &&
    res15.breakdown.date.score === 4,
    'Incomplete reports use calibrated neutral baselines (color:7, desc:6, loc:8, date:4)',
    `Total: ${res15?.score}%, sum: ${Object.values(res15?.breakdown || {}).reduce((s, c) => s + c.score, 0)}`
  );

  // ----------------------------------------------------
  // Scenario 16: Empty descriptions ("" -> neutral 6/20)
  // ----------------------------------------------------
  const emptyDescLost: ItemRecord = { ...lostWallet, description: '   ' };
  const res16 = calculateMatchScore(emptyDescLost, foundWallet);
  assert(
    res16 !== null && res16.breakdown.description.score === 6,
    'Empty or whitespace description gracefully receives neutral 6/20 baseline without crashing',
    `Desc score: ${res16?.breakdown.description.score}/20`
  );

  // ----------------------------------------------------
  // Scenario 17: Very short reports ("keys" vs "car key")
  // ----------------------------------------------------
  const shortLostKeys: ItemRecord = {
    ...lostWallet,
    _id: 'item_short_keys',
    itemName: 'Keys',
    category: 'Keys',
    color: 'Silver',
    description: 'Lost key',
    location: 'Parking',
  };
  const shortFoundKeys: ItemRecord = {
    ...foundWallet,
    _id: 'item_short_found_keys',
    itemName: 'Car Key',
    category: 'Keys',
    color: 'Silver',
    description: 'Found car keys',
    location: 'Parking lot',
  };
  const res17 = calculateMatchScore(shortLostKeys, shortFoundKeys);
  assert(
    res17 !== null && res17.breakdown.name.score >= 18 && res17.score >= 70,
    'Very short reports ("Keys" vs "Car Key") map to primary object "keys" and match reliably (>= 70%)',
    `Score: ${res17?.score}%, Name score: ${res17?.breakdown.name.score}/20`
  );

  // ----------------------------------------------------
  // Scenario 18: Typographical errors / casing / whitespace trimming
  // ----------------------------------------------------
  const lostPadded: ItemRecord = {
    ...lostWallet,
    category: '  ACCESSORIES  ',
    color: '  BLACK  ',
    location: '  mvp colony  ',
  };
  const res18 = calculateMatchScore(lostPadded, foundWallet);
  assert(
    res18 !== null &&
    res18.breakdown.category.score === 15 &&
    res18.breakdown.color.score === 15 &&
    res18.breakdown.location.score >= 15,
    'Typographical variations, casing, and excessive padding handled seamlessly',
    `Category: ${res18?.breakdown.category.score}/15, Color: ${res18?.breakdown.color.score}/15`
  );

  // ----------------------------------------------------
  // Scenario 19: False-positive prevention (object conflicts capped < 40%)
  // ----------------------------------------------------
  const falsePosPairs: [string, string][] = [
    ['Wallet', 'Handbag'],
    ['Black Shoes', 'Black Wallet'],
    ['Laptop', 'Headphones'],
    ['Smartwatch', 'Mobile Phone'],
  ];
  let allFalsePosBlocked = true;
  for (const [lName, fName] of falsePosPairs) {
    const l: ItemRecord = { ...lostWallet, itemName: lName };
    const f: ItemRecord = { ...foundWallet, itemName: fName };
    const res = calculateMatchScore(l, f);
    if (!res || res.score >= 40) {
      allFalsePosBlocked = false;
      console.error(`False positive breach: ${lName} vs ${fName} reached ${res?.score}%!`);
    }
  }
  assert(
    allFalsePosBlocked,
    'False-positive prevention: All conflicting primary objects are strictly capped below 40% threshold',
    'Tested 4 distinct contradictory pairs (all < 40%)'
  );

  // ----------------------------------------------------
  // Scenario 20: False-negative prevention (same object with partial info passes threshold >= 40%)
  // ----------------------------------------------------
  const partialLost: ItemRecord = {
    ...lostWallet,
    itemName: 'Wallet',
    category: 'Accessories',
    color: '', // omitted
    description: '', // omitted
    location: 'MVP Colony',
    date: '2026-10-30T10:00:00.000Z',
  };
  const res20 = calculateMatchScore(partialLost, foundWallet);
  assert(
    res20 !== null && res20.score >= 40,
    'False-negative prevention: Plausible match with missing optional fields still passes threshold (>= 40%)',
    `Score: ${res20?.score}%`
  );

  // ----------------------------------------------------
  // Scenario 21: Score breakdown consistency (all criteria sum exactly to total score)
  // ----------------------------------------------------
  const testResultsToCheck = [res1, res2, res3, res4, res5, res6, res7, res8, res9, res10, res11, res12, res14, res15, res16, res17, res18, res20];
  let allConsistent = true;
  for (let i = 0; i < testResultsToCheck.length; i++) {
    const r = testResultsToCheck[i];
    if (r) {
      const sum =
        r.breakdown.name.score +
        r.breakdown.category.score +
        r.breakdown.color.score +
        r.breakdown.description.score +
        r.breakdown.location.score +
        r.breakdown.date.score;
      if (sum !== r.score) {
        allConsistent = false;
        console.error(`Breakdown sum mismatch in test item ${i}: sum=${sum} != total=${r.score}`);
      }
    }
  }
  assert(
    allConsistent,
    'Score breakdown consistency: name + category + color + description + location + date strictly equals totalScore',
    `Verified across ${testResultsToCheck.length} varied matching test cases`
  );

  // ----------------------------------------------------
  // Scenario 22: Threshold boundary behavior (39% excluded, 40%+ included)
  // ----------------------------------------------------
  const candidateList = findPotentialMatches(
    [lostWallet, redBottle],
    [foundWallet, blueBottle, foundShoes],
    40
  );
  const allAboveThreshold = candidateList.every(c => c.score >= 40);
  const excludedShoes = !candidateList.some(c => c.foundItem.itemName === 'Black Shoes');
  assert(
    allAboveThreshold && candidateList.length >= 1 && excludedShoes,
    'Threshold boundary behavior: candidates strictly filtered at >= 40% (sub-40% items excluded)',
    `Qualifying matches count: ${candidateList.length}, All scores >= 40: ${allAboveThreshold}`
  );

  // ----------------------------------------------------
  // Integrity & Security Guards
  // ----------------------------------------------------
  // Guard A: No false self-matching (same user reports both records)
  const selfFoundWallet: ItemRecord = { ...foundWallet, userId: 'user_ananya' };
  const resSelf = calculateMatchScore(lostWallet, selfFoundWallet);
  assert(resSelf === null, 'Security Guard: Returns null when owner and finder are the same user (no self-matching)');

  // Guard B: Closed or Reclaimed reports excluded
  const closedLostWallet: ItemRecord = { ...lostWallet, status: 'CLOSED' };
  const resClosed = calculateMatchScore(closedLostWallet, foundWallet);
  assert(resClosed === null, 'Integrity Guard: Closed reports are excluded from active matching');

  const reclaimedFoundWallet: ItemRecord = { ...foundWallet, status: 'RECLAIMED' };
  const resReclaimed = calculateMatchScore(lostWallet, reclaimedFoundWallet);
  assert(resReclaimed === null, 'Integrity Guard: Reclaimed reports are excluded from active matching');

  // Guard C: Report type validation (LOST vs LOST, FOUND vs FOUND rejected)
  const anotherLost: ItemRecord = { ...lostWallet, _id: 'item_lost_another', userId: 'user_alex' };
  assert(calculateMatchScore(lostWallet, anotherLost) === null, 'Report type validation: LOST vs LOST rejected');

  const anotherFound: ItemRecord = { ...foundWallet, _id: 'item_found_another', userId: 'user_alex' };
  assert(calculateMatchScore(foundWallet, anotherFound) === null, 'Report type validation: FOUND vs FOUND rejected');

  console.log('====================================================');
  console.log(`RESULTS: ${passed}/${total} SCENARIOS & GUARDS PASSED`);
  console.log('====================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
