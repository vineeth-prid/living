import { propertyPhotos } from "./images";

export type Property = {
  id: string;
  name: string;
  locality: string;
  city: string;
  type: string;
  priceLabel: string;
  priceValue: number; // INR, for schema
  beds: number;
  baths: number;
  area: string; // sqft label
  status: "Ready to move" | "Under construction" | "New launch";
  summary: string;
  amenities: string[];
  details: { label: string; value: string }[];
  gallery: readonly string[];
};

export const properties: Property[] = [
  {
    id: "the-arbour-kakkanad",
    name: "The Arbour",
    locality: "Kakkanad",
    city: "Ernakulam",
    type: "3 & 4 BHK residences",
    priceLabel: "₹1.85 Cr",
    priceValue: 18500000,
    beds: 3,
    baths: 3,
    area: "1,840 sqft",
    status: "Ready to move",
    summary:
      "An elevated home in Kakkanad, wrapped in daylight and quiet greenery — minutes from the InfoPark corridor.",
    amenities: [
      "Sky lounge",
      "Infinity edge pool",
      "Landscaped courtyards",
      "Concierge desk",
      "EV charging",
      "Home automation ready",
    ],
    details: [
      { label: "Configuration", value: "3 & 4 BHK" },
      { label: "Carpet area", value: "1,840 – 2,410 sqft" },
      { label: "Floors", value: "G + 18" },
      { label: "Facing", value: "East / North-east" },
      { label: "Possession", value: "Ready" },
      { label: "RERA", value: "On request" },
    ],
    gallery: propertyPhotos.a,
  },
  {
    id: "riverstone-villas-marine-drive",
    name: "Riverstone Villas",
    locality: "Marine Drive",
    city: "Kochi",
    type: "4 BHK waterfront villas",
    priceLabel: "₹4.20 Cr",
    priceValue: 42000000,
    beds: 4,
    baths: 5,
    area: "3,650 sqft",
    status: "New launch",
    summary:
      "A limited collection of waterfront villas along the backwaters — private decks, warm stone, and long evening light.",
    amenities: [
      "Private plunge pool",
      "Waterfront deck",
      "Double-height living",
      "Staff quarters",
      "Home theatre",
      "Landscaped garden",
    ],
    details: [
      { label: "Configuration", value: "4 BHK villa" },
      { label: "Built-up area", value: "3,650 sqft" },
      { label: "Plot", value: "5.2 cents" },
      { label: "Facing", value: "Waterfront" },
      { label: "Possession", value: "New launch" },
      { label: "RERA", value: "On request" },
    ],
    gallery: propertyPhotos.b,
  },
  {
    id: "the-terraces-panampilly",
    name: "The Terraces",
    locality: "Panampilly Nagar",
    city: "Kochi",
    type: "3 BHK garden apartments",
    priceLabel: "₹2.35 Cr",
    priceValue: 23500000,
    beds: 3,
    baths: 3,
    area: "2,120 sqft",
    status: "Ready to move",
    summary:
      "Garden apartments in the heart of Panampilly Nagar — generous terraces, quiet interiors, everything within a walk.",
    amenities: [
      "Private terrace",
      "Rooftop garden",
      "Community lounge",
      "Covered parking",
      "24/7 security",
      "Rainwater harvesting",
    ],
    details: [
      { label: "Configuration", value: "3 BHK" },
      { label: "Carpet area", value: "2,120 sqft" },
      { label: "Floors", value: "G + 9" },
      { label: "Facing", value: "North" },
      { label: "Possession", value: "Ready" },
      { label: "RERA", value: "On request" },
    ],
    gallery: propertyPhotos.c,
  },
  {
    id: "willow-court-aluva",
    name: "Willow Court",
    locality: "Aluva",
    city: "Ernakulam",
    type: "2 & 3 BHK apartments",
    priceLabel: "₹98 L",
    priceValue: 9800000,
    beds: 2,
    baths: 2,
    area: "1,290 sqft",
    status: "Under construction",
    summary:
      "Considered, well-lit apartments near the metro at Aluva — a calm first home with room to grow.",
    amenities: [
      "Clubhouse",
      "Children's play area",
      "Fitness studio",
      "Jogging track",
      "Multipurpose hall",
      "Covered parking",
    ],
    details: [
      { label: "Configuration", value: "2 & 3 BHK" },
      { label: "Carpet area", value: "1,290 – 1,560 sqft" },
      { label: "Floors", value: "G + 14" },
      { label: "Facing", value: "East" },
      { label: "Possession", value: "Dec 2026" },
      { label: "RERA", value: "On request" },
    ],
    gallery: propertyPhotos.d,
  },
];
