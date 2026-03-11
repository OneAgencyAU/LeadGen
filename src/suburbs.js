'use strict';

/**
 * Adelaide suburbs ordered geographically from Somerton Park outward.
 * Each run picks the first suburb not yet in scraped_suburbs, works through
 * all business categories there, then moves to the next.
 */
const ADELAIDE_SUBURBS = [
  // Start
  'Somerton Park',

  // Ring 1 — immediate neighbours (~1 km)
  'Glenelg South',
  'Brighton',
  'Hove',
  'Seacliff Park',
  'Oaklands Park',

  // Ring 2 (~2–3 km)
  'Glenelg',
  'North Brighton',
  'Seacliff',
  'Park Holme',
  'Plympton Park',
  'Edwardstown',

  // Ring 3 (~3–5 km)
  'Glenelg North',
  'Novar Gardens',
  'South Brighton',
  'Kingston Park',
  'Morphettville',
  'Plympton',
  'Marion',
  'Hallett Cove',

  // Ring 4 (~5–8 km)
  'Henley Beach South',
  'Fulham Gardens',
  'Camden Park',
  'Clarence Park',
  'Colonel Light Gardens',
  'Mitcham',
  'Clovelly Park',
  'Warradale',
  'Dover Gardens',
  'Sheidow Park',
  'Trott Park',

  // Ring 5 — inner city and surrounds (~8–12 km)
  'Henley Beach',
  'Fulham',
  'West Beach',
  'Grange',
  'Westbourne Park',
  'Unley Park',
  'Millswood',
  'Lower Mitcham',
  'Torrens Park',
  'Reynella',
  'Woodcroft',
  "O'Halloran Hill",
  'Christie Downs',
  'Hackham',

  // Inner Adelaide (~10–15 km)
  'Glandore',
  'Melrose Park',
  'Daw Park',
  'South Plympton',
  'Ascot Park',
  'Hyde Park',
  'Fullarton',
  'Glen Osmond',
  'Glenunga',
  'Burnside',
  'Unley',
  'Wayville',
  'Goodwood',
  'Malvern',
  'Parkside',
  'Hawthorn',
  'Kingswood',

  // City core
  'Adelaide',
  'North Adelaide',
  'Norwood',
  'Kent Town',
  'Kensington',
  'College Park',
  'Payneham',
  'St Peters',
  'Marden',
  'Campbelltown',

  // Northern inner suburbs
  'Thebarton',
  'Hindmarsh',
  'Bowden',
  'Brompton',
  'Croydon',
  'Renown Park',
  'Prospect',
  'Broadview',
  'Blair Athol',
  'Kilburn',
  'Sefton Park',
  'Nailsworth',
  'Medindie',
  'Fitzroy',

  // Western suburbs
  'Findon',
  'Kidman Park',
  'Flinders Park',
  'Woodville',
  'Pennington',
  'Mansfield Park',
  'Semaphore',
  'Port Adelaide',

  // Eastern hills fringe
  'Magill',
  'Rosslyn Park',
  'Athelstone',
  'Newton',
  'Rostrevor',
  'Tranmere',
  'Hectorville',

  // Northern suburbs
  'Enfield',
  'Northfield',
  'Hillcrest',
  'Greenacres',
  'Holden Hill',
  'Valley View',
  'Para Hills',
  'Modbury',
  'Tea Tree Gully',
  'Golden Grove',
  'Greenwith',
  'Mawson Lakes',
  'Salisbury',
  'Elizabeth',

  // Southern suburbs
  'Morphett Vale',
  'Noarlunga Centre',
  'Christies Beach',
  'Port Noarlunga',
  'Seaford',
  'Aldinga Beach',

  // Hills
  'Stirling',
  'Aldgate',
  'Bridgewater',
  'Hahndorf',
  'Mount Barker',
];

module.exports = { ADELAIDE_SUBURBS };
