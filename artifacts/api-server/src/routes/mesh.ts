import { Router, type IRouter } from "express";

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const router: IRouter = Router();

router.get("/mesh/ice", (_req, res) => {
  const urls = process.env["TURN_URLS"];
  const username = process.env["TURN_USERNAME"];
  const credential = process.env["TURN_CREDENTIAL"];

  const iceServers: IceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];

  if (urls && username && credential) {
    iceServers.push({
      urls: urls.split(",").map((s) => s.trim()).filter(Boolean),
      username,
      credential,
    });
  }

  res.json({ iceServers });
});

export default router;
