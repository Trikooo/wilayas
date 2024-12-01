import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";

interface Wilaya {
  id: string;
  communes: string[];
  noest: {
    stations: NoestStation[];
    prices: {
      home: number;
      stopDesk: number;
    };
  };
  legacyData?: {
    previousWilaya: string;
    previousId: string;
  };
}

interface WilayaData {
  [wilayaName: string]: Wilaya;
}

interface NoestStation {
  commune: string;
  stationCode: string;
}

interface DeliveryPrice {
  tarif_id: number;
  wilaya_id: number;
  tarif: string;
  tarif_stopdesk: string;
}

interface LegacyData {
  [communeName: string]: {
    previousWilaya: string;
    previousId: string;
  };
}

function parseStopDeskStations(filePath: string): Map<string, string> {
  const csvContent = fs.readFileSync(filePath, "utf-8");
  const records = parse(csvContent, {
    delimiter: ",",
    skip_empty_lines: true,
    trim: true,
    columns: false,
  });

  const stationMap = new Map<string, string>();

  // Skip the header row
  for (const record of records.slice(1)) {
    const stationName = record[0]?.trim();
    const stationCode = record[1]?.trim();
    if (stationName && stationCode) {
      stationMap.set(stationName, stationCode);
    }
  }

  return stationMap;
}

function parseWilayas(filePath: string): Map<string, string> {
  const csvContent = fs.readFileSync(filePath, "utf-8");
  const records = parse(csvContent, {
    delimiter: ",",
    skip_empty_lines: true,
    trim: true,
    columns: false,
  });

  const wilayaMap = new Map<string, string>();

  // Skip the header row
  for (const record of records.slice(1)) {
    const code = record[0]?.trim();
    const name = record[1]?.trim();
    if (code && name && !isNaN(Number(code))) {
      wilayaMap.set(code, name);
    }
  }

  return wilayaMap;
}

function parseCommunes(
  filePath: string
): Map<string, { wilayaCode: string; communes: string[] }> {
  const csvContent = fs.readFileSync(filePath, "utf-8");
  const records = parse(csvContent, {
    delimiter: ",",
    skip_empty_lines: true,
    trim: true,
    columns: false,
  });

  const communesByWilaya = new Map<
    string,
    { wilayaCode: string; communes: string[] }
  >();

  // Skip the header row
  for (const record of records.slice(1)) {
    const communeName = record[0]?.trim();
    const wilayaCode = record[1]?.trim();

    if (communeName && wilayaCode) {
      if (!communesByWilaya.has(wilayaCode)) {
        communesByWilaya.set(wilayaCode, { wilayaCode, communes: [] });
      }
      communesByWilaya.get(wilayaCode)!.communes.push(communeName);
    }
  }

  return communesByWilaya;
}

function loadDeliveryPrices(
  filePath: string
): Map<string, { home: number; stopDesk: number }> {
  const rawData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const pricesMap = new Map<string, { home: number; stopDesk: number }>();

  for (const key in rawData.delivery) {
    const priceData = rawData.delivery[key];
    pricesMap.set(priceData.wilaya_id.toString(), {
      home: parseInt(priceData.tarif),
      stopDesk: parseInt(priceData.tarif_stopdesk),
    });
  }

  return pricesMap;
}

function loadLegacyData(filePath: string): LegacyData {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function transformData(
  stationsMap: Map<string, string>,
  wilayasMap: Map<string, string>,
  communesMap: Map<string, { wilayaCode: string; communes: string[] }>,
  deliveryPricesMap: Map<string, { home: number; stopDesk: number }>,
  legacyData: LegacyData
): WilayaData {
  const result: WilayaData = {};

  for (const [wilayaCode, wilayaName] of wilayasMap) {
    const communeData = communesMap.get(wilayaCode);

    if (communeData) {
      const noestStations: NoestStation[] = [];

      // Find station codes for communes
      for (const commune of communeData.communes) {
        // Find stations matching this wilaya
        for (const [stationName, stationCode] of stationsMap) {
          // Extract wilaya code from station code (first digits)
          const stationWilayaCode = stationCode.match(/^\d+/)?.[0];

          if (stationWilayaCode === wilayaCode) {
            const isAlreadyAdded = noestStations.some(
              (station) => station.commune === stationName
            );
            if (!isAlreadyAdded) {
              noestStations.push({
                commune: stationName,
                stationCode: stationCode,
              });
            }
          }
        }
      }

      // Get delivery prices
      const prices = deliveryPricesMap.get(wilayaCode) || {
        home: 0,
        stopDesk: 0,
      };

      // Check for legacy data
      const legacyEntry = Object.entries(legacyData).find(([commune]) =>
        communeData.communes.includes(commune)
      );

      const wilayaEntry: Wilaya = {
        id: wilayaCode,
        communes: communeData.communes,
        noest: {
          stations: noestStations,
          prices: {
            home: prices.home,
            stopDesk: prices.stopDesk,
          },
        },
      };

      // Add legacy data if exists
      if (legacyEntry) {
        wilayaEntry.legacyData = {
          previousWilaya: legacyEntry[1].previousWilaya,
          previousId: legacyEntry[1].previousId,
        };
      }

      result[wilayaName] = wilayaEntry;
    }
  }

  return result;
}

function main() {
  // Construct file paths
  const dataDir = "./data";
  const stationsFilePath = path.join(dataDir, "stopdesk_stations.csv");
  const wilayasFilePath = path.join(dataDir, "code_wilayas.csv");
  const communesFilePath = path.join(dataDir, "communes.csv");
  const deliveryPricesFilePath = path.join(dataDir, "deliveryPrices.json");
  const legacyDataFilePath = path.join(dataDir, "legacyData.json");

  // Parse data
  const stationsMap = parseStopDeskStations(stationsFilePath);
  const wilayasMap = parseWilayas(wilayasFilePath);
  const communesMap = parseCommunes(communesFilePath);
  const deliveryPricesMap = loadDeliveryPrices(deliveryPricesFilePath);
  const legacyData = loadLegacyData(legacyDataFilePath);

  // Transform data
  const transformedData = transformData(
    stationsMap,
    wilayasMap,
    communesMap,
    deliveryPricesMap,
    legacyData
  );

  // Write to JSON file
  fs.writeFileSync("wilayaData.json", JSON.stringify(transformedData, null, 2));

  console.log("Data transformation complete. Output saved to wilayaData.json");
}

// Uncomment to run
main();

export {
  parseStopDeskStations,
  parseWilayas,
  parseCommunes,
  transformData,
  loadDeliveryPrices,
  loadLegacyData,
  main,
};
