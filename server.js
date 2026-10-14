// =========================================================================
// 1. SYSTEM IMPORTS & ENV
// =========================================================================
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// =========================================================================
// 2. MIDDLEWARE
// =========================================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// =========================================================================
// 3. DATABASE — MongoDB Atlas (College / FSD)
// =========================================================================
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ MONGO_URI is missing. Add it to your .env file.");
    process.exit(1);
}

mongoose
    .connect(MONGO_URI)
    .then(() => {
        const { host, name } = mongoose.connection;
        console.log(`✨ MongoDB Atlas connected → host: ${host}, db: ${name}`);
    })
    .catch((err) => {
        console.error("❌ Atlas connection failed:", err.message);
        process.exit(1);
    });

// =========================================================================
// 4. SCHEMA & MODEL
// =========================================================================
const TodoSchema = new mongoose.Schema(
    {
        task: {
            type: String,
            required: [true, "Task description cannot be blank."],
            trim: true,
        },
        tag: {
            type: String,
            default: "",
            trim: true,
        },
        dueDate: {
            type: String,
            default: "",
            trim: true,
        },
        isCompleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

// Third arg forces the collection name to be exactly "todo"
// (otherwise Mongoose would create "todos" automatically).
const Todo = mongoose.model("Todo", TodoSchema, "todo");

// =========================================================================
// 5. ROUTES
// =========================================================================

/**
 * GET /api/tasks — READ all tasks (newest first)
 */
app.get("/api/tasks", async (req, res) => {
    try {
        const tasks = await Todo.find({}).sort({ createdAt: -1 });
        res.status(200).json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/tags — READ distinct tags (for autocomplete)
 */
app.get("/api/tags", async (req, res) => {
    try {
        const tags = await Todo.distinct("tag", { tag: { $ne: "" } });
        res.status(200).json(tags.sort((a, b) => a.localeCompare(b)));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/tasks — CREATE
 */
app.post("/api/tasks", async (req, res) => {
    try {
        const { task, tag, dueDate } = req.body;

        if (!task || !task.trim()) {
            return res.status(400).json({ error: "Task is required." });
        }

        const newTask = await Todo.create({
            task: task.trim(),
            tag: (tag || "").trim(),
            dueDate: (dueDate || "").trim(),
        });

        res.status(201).json(newTask);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/tasks/:id — UPDATE (task text, tag, and/or isCompleted)
 */
app.put("/api/tasks/:id", async (req, res) => {
    try {
        const { task, tag, dueDate, isCompleted } = req.body;
        const updates = {};

        if (typeof task === "string") updates.task = task.trim();
        if (typeof tag === "string") updates.tag = tag.trim();
        if (typeof dueDate == "string") updates.dueDate = dueDate.trim();
        if (typeof isCompleted === "boolean") updates.isCompleted = isCompleted;

        const updated = await Todo.findByIdAndUpdate(req.params.id, updates, {
            new: true,
            runValidators: true,
        });

        if (!updated) {
            return res.status(404).json({ error: "Task not found." });
        }

        res.status(200).json(updated);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/tasks/:id — DELETE
 */
app.delete("/api/tasks/:id", async (req, res) => {
    try {
        const deleted = await Todo.findByIdAndDelete(req.params.id);

        if (!deleted) {
            return res.status(404).json({ error: "Task not found." });
        }

        res.status(200).json({ success: true, message: "Task deleted." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET / — serve the app
 */
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// =========================================================================
// 6. START SERVER
// =========================================================================
app.listen(PORT, () => {
    console.log(`🚀 Running at http://localhost:${PORT}`);
});