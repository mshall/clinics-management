import { readFileSync } from "node:fs";
import { join } from "node:path";

type CellRow = {
  awsRegion: string;
  runtimeTimezone: string;
  stackId: string;
};

type Registry = {
  cells: Record<string, CellRow>;
};

function loadRegistry(): Registry {
  const path = join(__dirname, "..", "..", "platform", "data-cells.json");
  return JSON.parse(readFileSync(path, "utf8")) as Registry;
}

export function resolveCellDeployConfig(hostCell: string, deployRegionOverride?: string): CellRow & { hostCell: string } {
  const reg = loadRegistry();
  const cell = reg.cells[hostCell];
  if (!cell) {
    throw new Error(`Unknown hostCell for CDK deploy: ${hostCell}`);
  }
  const awsRegion = deployRegionOverride?.trim() || cell.awsRegion;
  if (awsRegion !== cell.awsRegion) {
    throw new Error(`hostCell ${hostCell} requires AWS region ${cell.awsRegion} (got ${awsRegion})`);
  }
  return { ...cell, hostCell, awsRegion };
}