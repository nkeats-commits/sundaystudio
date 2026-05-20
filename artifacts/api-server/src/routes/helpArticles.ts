import { Router, type IRouter } from "express";
import { eq, and, ilike, or, sql, getTableColumns } from "drizzle-orm";
import { db, helpArticlesTable, helpCategoryOrderTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/help-articles", async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const orderBy = [
      sql`COALESCE(${helpCategoryOrderTable.position}, 9999)`,
      helpArticlesTable.category,
      sql`COALESCE(${helpArticlesTable.position}, 9999)`,
      helpArticlesTable.title,
    ] as const;

    let articles;
    if (q.length > 0) {
      articles = await db
        .select(getTableColumns(helpArticlesTable))
        .from(helpArticlesTable)
        .leftJoin(
          helpCategoryOrderTable,
          eq(helpCategoryOrderTable.category, helpArticlesTable.category),
        )
        .where(
          and(
            eq(helpArticlesTable.published, true),
            or(
              ilike(helpArticlesTable.title, `%${q}%`),
              ilike(helpArticlesTable.body, `%${q}%`),
              ilike(helpArticlesTable.category, `%${q}%`),
            ),
          ),
        )
        .orderBy(...orderBy);
    } else {
      articles = await db
        .select(getTableColumns(helpArticlesTable))
        .from(helpArticlesTable)
        .leftJoin(
          helpCategoryOrderTable,
          eq(helpCategoryOrderTable.category, helpArticlesTable.category),
        )
        .where(eq(helpArticlesTable.published, true))
        .orderBy(...orderBy);
    }

    res.json(articles);
  } catch (err) {
    req.log.error({ err }, "list help articles failed");
    res.status(500).json({ error: "Failed to fetch help articles" });
  }
});

router.get("/help-articles/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const [article] = await db
      .select()
      .from(helpArticlesTable)
      .where(
        and(
          eq(helpArticlesTable.slug, slug),
          eq(helpArticlesTable.published, true),
        ),
      )
      .limit(1);

    if (!article) {
      res.status(404).json({ error: "Article not found" });
      return;
    }

    res.json(article);
  } catch (err) {
    req.log.error({ err }, "get help article failed");
    res.status(500).json({ error: "Failed to fetch help article" });
  }
});

export default router;
