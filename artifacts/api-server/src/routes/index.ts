import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meRouter from "./me";
import dashboardRouter from "./dashboard";
import servicePlansRouter from "./servicePlans";
import libraryRouter from "./library";
import generateRouter from "./generate";
import sermonsRouter from "./sermons";
import sermonSeriesRouter from "./sermonSeries";
import sermonResourcesRouter from "./sermonResources";
import generateSermonRouter from "./generateSermon";
import serviceTemplatesRouter from "./serviceTemplates";
import integrationsPcsRouter from "./integrationsPcs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(dashboardRouter);
router.use(servicePlansRouter);
router.use(libraryRouter);
router.use(generateRouter);
router.use(sermonsRouter);
router.use(sermonSeriesRouter);
router.use(sermonResourcesRouter);
router.use(generateSermonRouter);
router.use(serviceTemplatesRouter);
router.use(integrationsPcsRouter);

export default router;
