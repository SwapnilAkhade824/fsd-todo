document.addEventListener("DOMContentLoaded", () => {
  const API_TASKS = "/api/tasks";
  const API_TAGS = "/api/tags";

  const taskList = document.getElementById("task-list");
  const newTaskBtn = document.getElementById("new-task-btn");
  const dialog = document.getElementById("task-dialog");
  const form = document.getElementById("task-form");
  const dialogTitle = document.getElementById("dialog-title");
  const taskInput = document.getElementById("task-input");
  const dueInput = document.getElementById("due-input");
  const tagInput = document.getElementById("tag-input");
  const tagDropdown = document.getElementById("tag-dropdown");
  const formError = document.getElementById("form-error");
  const cancelBtn = document.getElementById("cancel-btn");
  const saveBtn = document.getElementById("save-btn");
  const statusEl = document.getElementById("app-status");

  let editingId = null;
  let knownTags = []; // in-memory cache of tags from the server

  // =============================================================
  // Fetch helper
  // =============================================================
  async function api(url, options = {}) {
    let res;
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
        },
      });
    } catch {
      throw new Error("Could not reach the server.");
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    if (!res.ok) {
      throw new Error(
        data?.error || data?.message || `Request failed (${res.status}).`,
      );
    }
    return data;
  }

  // =============================================================
  // Status bar
  // =============================================================
  function showStatus(msg, type = "success") {
    statusEl.textContent = msg;
    statusEl.style.color = type === "success" ? "#067647" : "#b42318";
    statusEl.hidden = !msg;
  }
  function clearStatus() {
    statusEl.textContent = "";
    statusEl.hidden = true;
  }

  // =============================================================
  // Custom tag dropdown
  // =============================================================
  async function loadTagSuggestions() {
    try {
      knownTags = await api(API_TAGS);
    } catch (err) {
      console.warn("Could not load tags:", err.message);
      knownTags = [];
    }
  }

  function openTagDropdown() {
    const query = tagInput.value.trim().toLowerCase();

    const matches = knownTags
      .filter((t) => (query === "" ? true : t.toLowerCase().includes(query)))
      .filter((t) => t.toLowerCase() !== query); // hide exact match

    if (matches.length === 0) {
      closeTagDropdown();
      return;
    }

    tagDropdown.replaceChildren();

    matches.forEach((tag) => {
      const li = document.createElement("li");
      li.className = "tag-option";
      li.setAttribute("role", "option");
      li.textContent = tag;

      // mousedown (not click) so it fires before the input's blur
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus on the input
        tagInput.value = tag;
        closeTagDropdown();
        tagInput.focus();
      });

      tagDropdown.appendChild(li);
    });

    tagDropdown.hidden = false;
    tagInput.setAttribute("aria-expanded", "true");
  }

  function closeTagDropdown() {
    tagDropdown.hidden = true;
    tagDropdown.replaceChildren();
    tagInput.setAttribute("aria-expanded", "false");
  }

  tagInput.addEventListener("focus", openTagDropdown);
  tagInput.addEventListener("input", openTagDropdown);
  tagInput.addEventListener("blur", () => {
    // small delay so a click on an option still lands
    setTimeout(closeTagDropdown, 120);
  });
  tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeTagDropdown();
    }
  });

  // =============================================================
  // Date formatting
  // =============================================================
  function formatDueDate(value) {
    if (!value) return "";
    const s = String(value).trim();
    if (!s) return "";

    // Today / Tomorrow shortcuts
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    if (s === todayStr) return "Today";
    if (s === tomorrowStr) return "Tomorrow";

    // YYYY-MM-DD → "Oct 20, 2026" (parsed as local to avoid TZ shift)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    return s;
  }

  // =============================================================
  // Rendering
  // =============================================================
  function renderEmptyState() {
    if (taskList.querySelector(".task-card")) return;
    if (taskList.querySelector(".empty-state")) return;

    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = 'No tasks yet. Click "New Task" to get started.';
    taskList.appendChild(empty);
  }

  function renderTask(task, { prepend = false } = {}) {
    if (!task?._id) return;

    taskList.querySelector(".empty-state")?.remove();

    const card = document.createElement("article");
    card.className = "task-card";
    card.dataset.taskId = task._id;
    card.classList.toggle("task-completed", !!task.isCompleted);

    // Checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = !!task.isCompleted;
    checkbox.addEventListener("change", () =>
      toggleComplete(task, card, checkbox),
    );

    // Content
    const content = document.createElement("div");
    content.className = "task-content";

    const title = document.createElement("p");
    title.className = "task-title";
    title.textContent = task.task;
    content.appendChild(title);

    // Meta row: due date
    const metaParts = [];
    if (task.dueDate) {
      const date = document.createElement("span");
      date.className = "task-date";

      const formatted = formatDueDate(task.dueDate);
      date.innerHTML = `
        <svg class="calendar-icon" viewBox="0 0 24 24" width="14" height="14"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2"/>
            <line x1="8" y1="3" x2="8" y2="7"/>
            <line x1="16" y1="3" x2="16" y2="7"/>
            <line x1="3" y1="11" x2="21" y2="11"/>
        </svg>
    `;
      date.appendChild(document.createTextNode(formatted));

      if (!task.isCompleted) {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (task.dueDate < todayStr) date.classList.add("overdue");
      }

      metaParts.push(date);
    }
    if (task.dueDate && !task.isCompleted) {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (task.dueDate < todayStr) date.classList.add("overdue");
    }

    // Tag (inline, next to date)
    if (task.tag) {
      const tag = document.createElement("span");
      tag.className = "task-tag";
      tag.textContent = task.tag;
      metaParts.push(tag);
    }

    if (metaParts.length) {
      const meta = document.createElement("div");
      meta.className = "task-meta";
      metaParts.forEach((el) => meta.appendChild(el));
      content.appendChild(meta);
    }

    // Actions
    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn edit-btn";
    editBtn.textContent = "✎";
    editBtn.title = "Edit task";
    editBtn.addEventListener("click", () => openDialog(task));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn delete-btn";
    deleteBtn.textContent = "×";
    deleteBtn.title = "Delete task";
    deleteBtn.addEventListener("click", () =>
      deleteTask(task, card, deleteBtn),
    );

    actions.append(editBtn, deleteBtn);

    card.append(checkbox, content, actions);

    const existing = taskList.querySelector(
      `.task-card[data-task-id="${CSS.escape(task._id)}"]`,
    );
    if (existing) existing.replaceWith(card);
    else if (prepend) taskList.prepend(card);
    else taskList.appendChild(card);
  }

  // =============================================================
  // READ
  // =============================================================
  async function loadTasks() {
    taskList.setAttribute("aria-busy", "true");
    clearStatus();
    try {
      const tasks = await api(API_TASKS);
      taskList.replaceChildren();
      if (!Array.isArray(tasks) || tasks.length === 0) renderEmptyState();
      else tasks.forEach((t) => renderTask(t));
    } catch (err) {
      showStatus(err.message, "error");
    } finally {
      taskList.removeAttribute("aria-busy");
    }
  }

  // =============================================================
  // UPDATE — toggle complete
  // =============================================================
  async function toggleComplete(task, card, checkbox) {
    checkbox.disabled = true;
    clearStatus();
    const desired = checkbox.checked;

    try {
      const updated = await api(`${API_TASKS}/${task._id}`, {
        method: "PUT",
        body: JSON.stringify({ isCompleted: desired }),
      });
      checkbox.checked = !!updated.isCompleted;
      card.classList.toggle("task-completed", !!updated.isCompleted);
      task.isCompleted = updated.isCompleted;
    } catch (err) {
      checkbox.checked = !desired;
      showStatus(err.message, "error");
    } finally {
      checkbox.disabled = false;
    }
  }

  // =============================================================
  // DELETE
  // =============================================================
  async function deleteTask(task, card, btn) {
    if (!window.confirm(`Delete "${task.task}"?`)) return;
    btn.disabled = true;
    clearStatus();
    try {
      await api(`${API_TASKS}/${task._id}`, { method: "DELETE" });
      card.remove();
      renderEmptyState();
      showStatus("Task deleted.", "success");
    } catch (err) {
      showStatus(err.message, "error");
      btn.disabled = false;
    }
  }

  // =============================================================
  // CREATE + UPDATE — shared dialog
  // =============================================================
  function openDialog(task = null) {
    editingId = task?._id || null;

    dialogTitle.textContent = task ? "Edit Task" : "New Task";
    saveBtn.textContent = task ? "Save Changes" : "Add Task";
    taskInput.value = task?.task || "";
    dueInput.value = task?.dueDate || "";
    tagInput.value = task?.tag || "";

    formError.textContent = "";
    formError.hidden = true;
    closeTagDropdown();

    dialog.showModal();
    taskInput.focus();

    // refresh tags in the background so newly added tags appear
    loadTagSuggestions();
  }

  newTaskBtn.addEventListener("click", () => openDialog());
  cancelBtn.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const task = taskInput.value.trim();
    const tag = tagInput.value.trim();
    const dueDate = dueInput.value; // already "YYYY-MM-DD" or ""

    if (!task) {
      formError.textContent = "Please enter a task.";
      formError.hidden = false;
      taskInput.focus();
      return;
    }

    const originalLabel = saveBtn.textContent;
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    formError.hidden = true;

    try {
      if (editingId) {
        const updated = await api(`${API_TASKS}/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({ task, tag, dueDate }),
        });
        renderTask(updated);
        showStatus("Task updated.", "success");
      } else {
        const created = await api(API_TASKS, {
          method: "POST",
          body: JSON.stringify({ task, tag, dueDate }),
        });
        renderTask(created, { prepend: true });
        showStatus("Task added.", "success");
      }
      dialog.close();
    } catch (err) {
      formError.textContent = err.message;
      formError.hidden = false;
    } finally {
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.textContent = originalLabel;
    }
  });

  // =============================================================
  // Boot
  // =============================================================
  loadTasks();
  loadTagSuggestions();
});
