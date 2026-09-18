export interface CRSItem {
  code: string;
  name: string;
  def: string;
}

export const CRS_LIST: CRSItem[] = [
  // Global & Web Standard Systems
  { code: 'EPSG:4326', name: 'WGS 84 (Coğrafi - Global)', def: '+proj=longlat +datum=WGS84 +no_defs' },
  { code: 'EPSG:3857', name: 'WGS 84 / Pseudo-Mercator (Web Mercator)', def: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs' },
  
  // Turkey TUREF / TM (3-Degree)
  { code: 'EPSG:5253', name: 'TUREF / TM27 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5254', name: 'TUREF / TM30 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5255', name: 'TUREF / TM33 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5256', name: 'TUREF / TM36 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=36 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5257', name: 'TUREF / TM39 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=39 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5258', name: 'TUREF / TM42 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=42 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:5259', name: 'TUREF / TM45 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=45 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  
  // WGS 84 / UTM Northern Hemisphere (6-Degree)
  { code: 'EPSG:32630', name: 'WGS 84 / UTM Zone 30N', def: '+proj=utm +zone=30 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32631', name: 'WGS 84 / UTM Zone 31N', def: '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32632', name: 'WGS 84 / UTM Zone 32N', def: '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32633', name: 'WGS 84 / UTM Zone 33N', def: '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32634', name: 'WGS 84 / UTM Zone 34N', def: '+proj=utm +zone=34 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32635', name: 'WGS 84 / UTM Zone 35N', def: '+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32636', name: 'WGS 84 / UTM Zone 36N', def: '+proj=utm +zone=36 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32637', name: 'WGS 84 / UTM Zone 37N', def: '+proj=utm +zone=37 +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32638', name: 'WGS 84 / UTM Zone 38N', def: '+proj=utm +zone=38 +datum=WGS84 +units=m +no_defs' },

  // WGS 84 / UTM Southern Hemisphere (6-Degree)
  { code: 'EPSG:32735', name: 'WGS 84 / UTM Zone 35S', def: '+proj=utm +zone=35 +south +datum=WGS84 +units=m +no_defs' },
  { code: 'EPSG:32736', name: 'WGS 84 / UTM Zone 36S', def: '+proj=utm +zone=36 +south +datum=WGS84 +units=m +no_defs' },

  // European Coordinate Systems
  { code: 'EPSG:25832', name: 'ETRS89 / UTM Zone 32N (Avrupa)', def: '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:3035', name: 'ETRS89 / LAEA Europe (Avrupa Karasal)', def: '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:27700', name: 'OSGB 1936 / British National Grid (İngiltere)', def: '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +datum=OSGB36 +units=m +no_defs' },
  { code: 'EPSG:2154', name: 'RGF93 / Lambert-93 (Fransa)', def: '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:31467', name: 'DHDN / Gauss-Kruger Zone 3 (Almanya)', def: '+proj=tmerc +lat_0=0 +lon_0=9 +k=1 +x_0=3500000 +y_0=0 +ellps=bessel +datum=potsdam +units=m +no_defs' },

  // North American Systems (NAD83 & NAD27)
  { code: 'EPSG:4269', name: 'NAD83 (Kuzey Amerika Coğrafi)', def: '+proj=longlat +datum=NAD83 +no_defs' },
  { code: 'EPSG:26910', name: 'NAD83 / UTM Zone 10N (ABD Batı Yakası)', def: '+proj=utm +zone=10 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26911', name: 'NAD83 / UTM Zone 11N (ABD Güneybatı)', def: '+proj=utm +zone=11 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26912', name: 'NAD83 / UTM Zone 12N (ABD Kayalık Dağlar)', def: '+proj=utm +zone=12 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26913', name: 'NAD83 / UTM Zone 13N (ABD Merkez)', def: '+proj=utm +zone=13 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26915', name: 'NAD83 / UTM Zone 15N (ABD Ortabatı)', def: '+proj=utm +zone=15 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26917', name: 'NAD83 / UTM Zone 17N (ABD Doğu Yakası)', def: '+proj=utm +zone=17 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:26918', name: 'NAD83 / UTM Zone 18N (ABD Kuzeydoğu)', def: '+proj=utm +zone=18 +datum=NAD83 +units=m +no_defs' },
  { code: 'EPSG:4267', name: 'NAD27 (Kuzey Amerika Tarihsel)', def: '+proj=longlat +datum=NAD27 +no_defs' },

  // Asia-Pacific Systems
  { code: 'EPSG:6676', name: 'JGD2011 / Japan Plane Rectangular CS VI (Japonya)', def: '+proj=tmerc +lat_0=36 +lon_0=136 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:7855', name: 'GDA2020 / MGA Zone 55 (Avustralya Doğu)', def: '+proj=utm +zone=55 +south +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:7856', name: 'GDA2020 / MGA Zone 56 (Sidney/Brisbane)', def: '+proj=utm +zone=56 +south +ellps=GRS80 +units=m +no_defs' },
  { code: 'EPSG:4490', name: 'CGCS2000 (Çin Coğrafi)', def: '+proj=longlat +ellps=GRS80 +no_defs' },

  // ED50 (European Datum 1950) 3-Degree (TM)
  { code: 'EPSG:5220', name: 'ED50 / TM27 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=27 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5221', name: 'ED50 / TM30 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5222', name: 'ED50 / TM33 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=33 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5223', name: 'ED50 / TM36 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=36 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5224', name: 'ED50 / TM39 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=39 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5225', name: 'ED50 / TM42 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=42 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:5226', name: 'ED50 / TM45 (3°)', def: '+proj=tmerc +lat_0=0 +lon_0=45 +k=1 +x_0=500000 +y_0=0 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  
  // ED50 (European Datum 1950) 6-Degree (UTM)
  { code: 'EPSG:23035', name: 'ED50 / UTM Zone 35N (6°)', def: '+proj=utm +zone=35 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23036', name: 'ED50 / UTM Zone 36N (6°)', def: '+proj=utm +zone=36 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23037', name: 'ED50 / UTM Zone 37N (6°)', def: '+proj=utm +zone=37 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
  { code: 'EPSG:23038', name: 'ED50 / UTM Zone 38N (6°)', def: '+proj=utm +zone=38 +ellps=intl +towgs84=-87,-98,-121,0,0,0,0 +units=m +no_defs' },
];
