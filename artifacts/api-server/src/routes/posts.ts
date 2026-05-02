import { Router } from "express";

const router = Router();

type Post = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  lat: number | null;
  lng: number | null;
  timestamp: number;
  expiresAt: number;
};

const store = new Map<string, Post>();

function purgeExpired() {
  const now = Date.now();
  for (const [id, post] of store) {
    if (post.expiresAt <= now) store.delete(id);
  }
}

router.get("/posts", (_req, res) => {
  purgeExpired();
  res.json(Array.from(store.values()).sort((a, b) => b.timestamp - a.timestamp));
});

router.post("/posts/batch", (req, res) => {
  const body = req.body;
  if (!Array.isArray(body)) {
    res.status(400).json({ error: "Expected array of posts" });
    return;
  }
  const now = Date.now();
  let added = 0;
  for (const post of body as Post[]) {
    if (
      typeof post.id === "string" &&
      typeof post.text === "string" &&
      typeof post.timestamp === "number" &&
      typeof post.expiresAt === "number" &&
      post.expiresAt > now &&
      !store.has(post.id)
    ) {
      store.set(post.id, post);
      added++;
    }
  }
  res.json({ added, total: store.size });
});

export default router;
