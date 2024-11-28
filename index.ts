import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";

interface Wilaya {
  id: string;
  communes: string[];
  noestStations: NoestStation[];
}

interface WilayaData {
  [wilayaName: string]: Wilaya;
}
interface NoestStation {
  commune: string;
  stationCode: string;
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

function transformData(
  stationsMap: Map<string, string>,
  wilayasMap: Map<string, string>,
  communesMap: Map<string, { wilayaCode: string; communes: string[] }>
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
            console.log(isAlreadyAdded);
            if (!isAlreadyAdded) {
              noestStations.push({
                commune: stationName,
                stationCode: stationCode,
              });
            }
          }
        }
      }

      result[wilayaName] = {
        id: wilayaCode,
        communes: communeData.communes,
        noestStations,
      };
    }
  }

  return result;
}
function main() {
  const stationsMap = parseStopDeskStations("./data/stopdesk_stations.csv");
  const wilayasMap = parseWilayas("./data/code_wilayas.csv");
  const communesMap = parseCommunes("./data/communes.csv");

  const transformedData = transformData(stationsMap, wilayasMap, communesMap);

  // Write to JSON file
  fs.writeFileSync(
    "wilayaData.json",
    JSON.stringify(transformedData, null, 2)
  );

  console.log("Data transformation complete. Output saved to wilaya_data.json");
}

// Uncomment to run
main();

export {
  parseStopDeskStations,
  parseWilayas,
  parseCommunes,
  transformData,
  main,
};
