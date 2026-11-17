import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getDeploymentCell } from "./data-cells";

const execFileAsync = promisify(execFile);

export type MarketProvisionResult = {
  mode: "shared" | "deploy_required";
  message: string;
  dataRegion: string;
};

/**
 * When launching a market, decide whether to reuse an existing AWS cell or request a new deploy.
 * Shares Frankfurt when PLATFORM_SHARED_DATA_REGIONS includes the target region (default: eu-central-1).
 */
@Injectable()
export class MarketProvisionService {
  private readonly log = new Logger(MarketProvisionService.name);

  resolveProvision(dataRegion: string, hostCell: string): MarketProvisionResult {
    const cellRegion = getDeploymentCell(hostCell.trim() || "frankfurt").awsRegion;
    const region = dataRegion.trim() || cellRegion;
    if (region !== cellRegion) {
      this.log.warn(
        `Market hostCell ${hostCell} expects AWS region ${cellRegion} but dataRegion=${region}; deploy must target ${cellRegion}`,
      );
    }
    const shared = (process.env.PLATFORM_SHARED_DATA_REGIONS ?? "eu-central-1")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (shared.includes(region)) {
      return {
        mode: "shared",
        dataRegion: region,
        message: `Using existing Kiorly platform stack in ${region} (${hostCell} cell). No separate instance required.`,
      };
    }
    return {
      mode: "deploy_required",
      dataRegion: region,
      message: `New AWS deploy required for cell ${hostCell} (${cellRegion}). Run: KIORLY_HOST_CELL=${hostCell} AWS_REGION=${cellRegion} bash scripts/deploy-aws.sh`,
    };
  }

  async tryTriggerDeploy(dataRegion: string): Promise<string | null> {
    if (process.env.MARKET_LAUNCH_RUN_DEPLOY !== "1") return null;
    const repoRoot = process.env.KIORLY_REPO_ROOT?.trim();
    if (!repoRoot) return null;
    try {
      const { stdout } = await execFileAsync("bash", ["scripts/ensure-market-cell.sh", dataRegion], {
        cwd: repoRoot,
        env: process.env,
        timeout: 120_000,
      });
      return stdout.trim().slice(0, 2000);
    } catch (err) {
      this.log.warn(`ensure-market-cell failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}