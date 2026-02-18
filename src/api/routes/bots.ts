const express = require("express");
const router = express.Router();
const db = require("../../db");

// Fetch bot data
router.get("/:botId", async (req, res) => {
    const { botId } = req.params;

    try {
        const bot = await db.get(`SELECT * FROM bots WHERE id = ?`, botId);

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

module.exports = router;