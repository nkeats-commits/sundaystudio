import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meRouter from "./me";
import dashboardRouter from "./dashboard";
import servicePlansRouter from "./servicePlans";
import libraryRouter from "./library";
import generateRouter from "./generate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(dashboardRouter);
router.use(servicePlansRouter);
router.use(libraryRouter);
router.use(generateRouter);

export default router;
