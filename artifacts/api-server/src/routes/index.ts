import { Router, type IRouter } from "express";
import healthRouter from "./health";
import postsRouter from "./posts";
import meshRouter from "./mesh";

const router: IRouter = Router();

router.use(healthRouter);
router.use(postsRouter);
router.use(meshRouter);

export default router;
