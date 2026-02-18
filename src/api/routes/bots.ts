import express, { Request, Response } from "express";
const router = express.Router();
import { getDb } from "../../db";

// Fetch bot data
router.get("/:botId", async (req: Request, res: Response) => {
    const { botId } = req.params;

    try {
        const bot = await getDb().prepare(`SELECT * FROM bots WHERE id = ?`).get(botId);

        if (!bot) {
            return res.status(404).json({ error: "Bot not found" });
        }

        res.json({
            id: bot.id,
            name: bot.name,
            balance: bot.balance,
            status: bot.status,
            strategy: bot.strategy
        });
    } catch (error) {
        console.error("Error fetching bot data: ", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;