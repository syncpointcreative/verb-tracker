import { Stage, AssetStatus } from './supabase'

export const STAGES: Stage[] = ['Awareness', 'Consideration', 'Conversion']

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
}

export const STATUS_CONFIG: Record<AssetStatus, { bg: string; text: string; dot: string }> = {
  'Ready to Upload':         { bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-500' },
  'Live / Running':          { bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-500' },
  'Expired':                 { bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500' },
  'Needs Refresh / Missing': { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
}

export const TARGET_ASSETS_PER_STAGE = 3
export const EXPIRY_DAYS = 90
export const SLACK_CHANNEL_ID = 'C0843S6QRA8'

// Naming convention parser maps
export const CLIENT_CODES: Record<string, string> = {
  BIOM: 'Biom', CHOMPS: 'Chomps', HIMA: 'Himapure',
  HL: 'Home & Laundry', DUPES: 'Dupes & Co', FLAV: 'FlavCity', FTUB: 'FaceTub', FT: 'FaceTub',
}
export const PRODUCT_CODES: Record<string, string> = {
  FT: 'FaceTub',
  APW: 'All Purpose Wipes', DW: 'Disinfecting Wipes',
  BW: 'Baby Wipes', FW: 'Flushable Wipes',
  OBB: 'Original Beef', SMK: 'Smokey BBQ Beef',
  SSB: 'Sea Salt Beef', SPV: 'Salt & Pepper Venison',
  JAL: 'Jalapeño Beef', TAC: 'Taco Seasoned Beef',
  OTK: 'Original Turkey', VAR: 'Variety Pack',
  HH: 'Himalayan Honey (2lb Tub)',
  OBL: 'Ocean Breeze Laundry Detergent Sheets',
  DP: 'Dishwashing Eco Pods', LDS: 'Lemon Detergent Eco Sheets for Dishwashing',
  CR: 'Cinnamon Roll',
  PC: 'Pineapple Coconut', SC: 'Salted Caramel',
  CPB: 'Chocolate Peanut Butter', CC: 'Cookies & Cream',
  MC: 'Mint Chocolate', EP: 'Electrolyte Packs',
  FVP: 'Variety Pack', AF: 'Any Flavor', AT: 'Any Tea',
}
export const TYPE_CODES: Record<string, string> = {
  UGC: 'UGC', BLS: 'Brand / Lifestyle', PD: 'Product Demo',
  CRL: 'Creator-Led', TREV: 'Testimonial / Review',
  TUT: 'Tutorial / How-To', PROMO: 'Promotional',
  SI: 'Static Imagery', MG: 'Motion Graphics', AFF: 'Affiliate Video',
}
export const CREATOR_CODES: Record<string, string> = {
  DB: 'David Butler', MA: 'Mitchell Allen', MP: 'Mia Pistilli',
  DY: 'Dylan Nelson', JM: 'Jayden Mejia', LR: 'Libby Ragole',
  BS: 'Becca Siefert', AO: 'Anthony Oshea', BG: 'Brielle Galekovic',
  MX: 'Max Gomas', ID: 'Isabella Donoso', SB: 'Seth Baron', LS: 'Liz Snyder', MD: 'Mike Dobson',
}
