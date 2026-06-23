import { Stage, AssetStatus } from './supabase'

export const STAGES: Stage[] = ['Awareness', 'Consideration', 'Conversion', 'Community Interaction']

export const STAGE_CONFIG = {
  Awareness: {
    label: 'Awareness',
    description: 'Stop the scroll. Introduce the brand.',
    headerBg: 'bg-red-900',
    lightBg: 'bg-red-50',
    rowBg: 'bg-red-50/50',
    text: 'text-red-900',
    border: 'border-red-200',
    badge: 'bg-red-100 text-red-800',
  },
  Consideration: {
    label: 'Consideration',
    description: 'Educate. Build desire. Differentiate.',
    headerBg: 'bg-amber-900',
    lightBg: 'bg-amber-50',
    rowBg: 'bg-amber-50/50',
    text: 'text-amber-900',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-800',
  },
  Conversion: {
    label: 'Conversion',
    description: 'Drive the click. Close the sale.',
    headerBg: 'bg-emerald-900',
    lightBg: 'bg-emerald-50',
    rowBg: 'bg-emerald-50/50',
    text: 'text-emerald-900',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800',
  },
  'Community Interaction': {
    label: 'Community Interaction',
    description: 'Spark conversation. Build community and engagement.',
    headerBg: 'bg-sky-900',
    lightBg: 'bg-sky-50',
    rowBg: 'bg-sky-50/50',
    text: 'text-sky-900',
    border: 'border-sky-200',
    badge: 'bg-sky-100 text-sky-800',
  },
}

export const STATUS_CONFIG: Record<AssetStatus, { bg: string; text: string; dot: string }> = {
  'Pending Review':          { bg: 'bg-violet-100', text: 'text-violet-800', dot: 'bg-violet-500' },
  'Ready to Upload':         { bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500' },
  'Live / Running':          { bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-500' },
  'Paused':                  { bg: 'bg-sky-100',    text: 'text-sky-700',    dot: 'bg-sky-400'   },
  'Expired':                 { bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500'   },
  'Needs Refresh / Missing': { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  'Pulled':                  { bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500' },
  'Removed by Request':      { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'  },
}

export const TARGET_ASSETS_PER_STAGE = 3
export const EXPIRY_DAYS = 14        // assets ≤14 days (Fresh/Monitor) = covered; 15+ (Refresh Soon) = needs new creative
export const REFRESH_SOON_DAYS = 15  // day threshold that triggers Refresh Soon + Slack alert
export const SLACK_CHANNEL_ID = 'C0B59BHPG81'
// Workspace-specific base URL — used to build deep links that open in the correct workspace
// instead of defaulting to whichever workspace the user has active in their Slack app.
export const SLACK_WORKSPACE_URL = 'https://elevensignal.slack.com'
// Channel for outbound asset-need alerts — set SLACK_ASSET_NEEDS_CHANNEL_ID in Vercel env vars
export const ASSET_NEEDS_CHANNEL_ID = process.env.SLACK_ASSET_NEEDS_CHANNEL_ID ?? ''

// Naming convention parser maps
export const CLIENT_CODES: Record<string, string> = {
  BIOM: 'Biom', CHOMPS: 'Chomps', HIMA: 'Himapure',
  HL: 'Home & Laundry', DUPES: 'Dupes & Co', FLAV: 'FlavCity', FTUB: 'FaceTub', FT: 'FaceTub',
  MOMO: 'Momofuku', JOO: 'Joolies', ESW: 'ESW Beauty',
}
export const PRODUCT_CODES: Record<string, string> = {
  FT: 'FaceTub',
  APW: 'All Purpose Wipes', DW: 'Disinfecting Wipes',
  BW: 'Baby Wipes', FW: 'Flushable Wipes',
  OBB: 'Original Beef', SMK: 'Smokey BBQ Beef',
  SSB: 'Sea Salt Beef', SPV: 'Salt & Pepper Venison',
  JAL: 'Jalapeño Beef', TAC: 'Taco Seasoned Beef',
  OTK: 'Original Turkey', VAR: 'Variety Pack',
  OGC: 'Original Chicken', NHC: 'Nashville Hot Chicken',
  SBC: 'Savory Breakfast Chicken', CTP: 'Chicken Trial Pack',
  HH: 'Himalayan Honey (2lb Tub)',
  OBL: 'Ocean Breeze Laundry Detergent Sheets',
  DP: 'Dishwashing Eco Pods', LDS: 'Lemon Detergent Eco Sheets for Dishwashing',
  CR: 'Cinnamon Roll',
  PC: 'Pineapple Coconut', SC: 'Salted Caramel',
  CPB: 'Chocolate Peanut Butter', CC: 'Cookies & Cream',
  MC: 'Mint Chocolate', EP: 'Electrolyte Packs',
  FVP: 'Variety Pack', AF: 'Any Flavor', AT: 'Any Tea',
  ISO: 'Immune Support Orange', MVOM: 'Multi-Vitamin Orange-Mango',
  JHCG: 'Joint Health Citrus Ginger', SSVM: 'Sleep Support Vanilla Mint',
  CCSD: 'Chili Crunch Sushi Dip',
  LEM: 'Lemonade', GLEM: 'Grapefruit Lemonade',
  VL: 'Vanilla Latte Protein', CWB: 'Coffee With Benefits',
  // Joolies — Date Sours flavors
  ADF: 'All Date Flavors',
  DSBR: 'Date Sours Blue Raspberry', DSPCH: 'Date Sours Peachy',
  DSWM: 'Date Sours Watermelon',     DSCHC: 'Date Sours Cherry Cola',
  // ESW Beauty
  MBP: 'Multiple Beauty Products', SMLE: 'Strawberry Matcha Latte Eye Patch',
  SCM: 'Strawberry & Cream Mask', MIST: 'Mist', GLP: 'Gloss Lip Treatments',
  SCR: 'Strawberry Coco Rose', BSK: 'Beauty Sleep Kit',
  RSK: 'Rise and Shine Kit',   ASK: 'Awaken Skin Kit',
  GHK: 'Get Hydrated Kit',
}
// Funnel stage codes — embedded in filename at position 3 (standard format, no TYPE)
// Standard format: CLIENT-PRODUCT-STAGE-CREATOR-TITLE-DATE
// e.g.  CHOMPS-SMK-AWA-LR-SummerHook-050626.mp4
// Legacy format:   CLIENT-PRODUCT-TYPE-STAGE-CREATOR-TITLE-DATE (still supported)
export const STAGE_CODES: Record<string, string> = {
  AWA: 'Awareness',
  CON: 'Consideration',
  CVR: 'Conversion',
  INT: 'Community Interaction',
}

export const TYPE_CODES: Record<string, string> = {
  UGC: 'UGC', BLS: 'Brand / Lifestyle', PD: 'Product Demo',
  CRL: 'Creator-Led', TREV: 'Testimonial / Review',
  TUT: 'Tutorial / How-To', PROMO: 'Promotional',
  SI: 'Static Imagery', MG: 'Motion Graphics', AFF: 'Affiliate Video',
}
export const CREATOR_CODES: Record<string, string> = {
  DB: 'David Butler', MA: 'Mitchell Allen', MP: 'Mia Pistilli',
  DN: 'Dylan Nelson', JM: 'Jayden Mejia', LR: 'Libby Ragole',
  BS: 'Becca Siefert', AO: 'Anthony Oshea', BG: 'Brielle Galekovic',
  MX: 'Max Gomas', ID: 'Isabella Donoso', SB: 'Seth Baron', LS: 'Liz Snyder', MD: 'Mike Dobson',
}
