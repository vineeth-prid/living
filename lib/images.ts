// Curated premium placeholder imagery (Unsplash, verified-resolving IDs).
// ponytail: swap these IDs for the real Living photo shoot when it lands —
// callers only ever touch the exported names below.
const U = (id: string, w = 1600, q = 68) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=${q}`;

export const img = {
  // Home / hero
  heroArch: U("1600585154340-be6161a56a0c", 2000),
  heroInterior: U("1600607687939-ce8a6c25118c", 1600),
  heroVilla: U("1613490493576-7fde63acd811", 1600),
  storyLiving: U("1600210492486-724fe5c67fb0", 1400),
  storyDetail: U("1493809842364-78817add7ffb", 1200),
  storyMorning: U("1600566753086-00f18fb6b3ea", 1200),

  // Services
  buying: U("1600596542815-ffad4c1539a9", 1400),
  selling: U("1560448204-e02f11c3d0e2", 1400),
  nri: U("1502005229762-cf1b2da7c5d6", 1600),
  concierge: U("1556228453-efd6c1ff04f6", 1200),
  valuation: U("1554995207-c18c203602cb", 1200),

  // About
  legacy: U("1486406146926-c627a92ad1ab", 1600),
  team: U("1497366216548-37526070297c", 1400),
  city: U("1524758631624-e2822e304c36", 1600),

  // Platform
  community: U("1523217582562-09d0def993a6", 1400),
  building: U("1545324418-cc1a3fa10c00", 1400),

  // Contact
  office: U("1497366811353-6870744d04b2", 1400),
};

// Property gallery pools (real, verified IDs).
export const propertyPhotos = {
  a: [
    "1600585154340-be6161a56a0c",
    "1600607687939-ce8a6c25118c",
    "1600566753086-00f18fb6b3ea",
    "1600210492486-724fe5c67fb0",
  ],
  b: [
    "1613490493576-7fde63acd811",
    "1580587771525-78b9dba3b914",
    "1600047509807-ba8f99d2cdde",
    "1512917774080-9991f1c4c750",
  ],
  c: [
    "1600596542815-ffad4c1539a9",
    "1567767292278-a4f21aa2d36e",
    "1600585152220-90363fe7e115",
    "1502672260266-1c1ef2d93688",
  ],
  d: [
    "1522708323590-d24dbb6b0267",
    "1560185007-cde436f6a4d0",
    "1484154218962-a197022b5858",
    "1449844908441-8829872d2607",
  ],
} as const;

export const photo = (id: string, w = 1400) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;
