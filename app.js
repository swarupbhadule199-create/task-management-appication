// ================= STATE CONFIGURATION =================
const state = {
  token: localStorage.getItem('zen_token') || null,
  user: JSON.parse(localStorage.getItem('zen_user')) || null,
  tasks: [],
  activeChecklist: [], // Temp checklist items in modal
  theme: localStorage.getItem('zen_theme') || 'dark',
  ws: null,
};

// ================= DOM ELEMENTS =================
const DOM = {
  authContainer: document.getElementById('auth-container'),
  appContainer: document.getElementById('app-container'),
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  goToRegister: document.getElementById('go-to-register'),
  goToLogin: document.getElementById('go-to-login'),
  loginError: document.getElementById('login-error'),
  registerError: document.getElementById('register-error'),
  wsStatus: document.getElementById('ws-status'),
  userDisplayName: document.getElementById('user-display-name'),
  logoutBtn: document.getElementById('logout-btn'),
  themeToggle: document.getElementById('theme-toggle'),
  searchInput: document.getElementById('search-input'),
  priorityFilter: document.getElementById('priority-filter'),
  categoryFilter: document.getElementById('category-filter'),
  btnNewTask: document.getElementById('btn-new-task'),
  taskModal: document.getElementById('task-modal'),
  taskForm: document.getElementById('task-form'),
  modalTitleText: document.getElementById('modal-title-text'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  btnCancelTask: document.getElementById('btn-cancel-task'),
  taskFormId: document.getElementById('task-form-id'),
  taskTitle: document.getElementById('task-title'),
  taskDesc: document.getElementById('task-desc'),
  taskPriority: document.getElementById('task-priority'),
  taskCategory: document.getElementById('task-category'),
  taskDueDate: document.getElementById('task-due-date'),
  taskStatus: document.getElementById('task-status'),
  checklistInput: document.getElementById('checklist-item-input'),
  btnAddChecklist: document.getElementById('btn-add-checklist-item'),
  checklistItemsList: document.getElementById('checklist-items-list'),
  toastContainer: document.getElementById('toast-container'),
  
  // Columns
  cols: {
    todo: document.getElementById('col-todo'),
    in_progress: document.getElementById('col-in_progress'),
    review: document.getElementById('col-review'),
    completed: document.getElementById('col-completed'),
  },
  
  // Counts
  counts: {
    todo: document.getElementById('count-todo'),
    in_progress: document.getElementById('count-in_progress'),
    review: document.getElementById('count-review'),
    completed: document.getElementById('count-completed'),
  },

  // Stats
  stats: {
    total: document.getElementById('stat-total'),
    completed: document.getElementById('stat-completed'),
    dueSoon: document.getElementById('stat-due-soon'),
    rate: document.getElementById('stat-rate'),
  }
};

// ================= THEME TOGGLE =================
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
}

DOM.themeToggle.addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('zen_theme', state.theme);
});

// ================= TOAST SYSTEM =================
function showToast(title, message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'warning') icon = 'fa-exclamation-triangle';
  if (type === 'error') icon = 'fa-times-circle';

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close"><i class="fa-solid fa-xmark"></i></button>
  `;
  
  DOM.toastContainer.appendChild(toast);
  
  // Close handler
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  });
  
  // Auto remove
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }
  }, 5000);
}

// ================= WEBSOCKET CONNECTION =================
function connectWebSocket() {
  if (state.ws) {
    state.ws.close();
  }

  // Detect hostname and port automatically
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    DOM.wsStatus.classList.add('connected');
    DOM.wsStatus.querySelector('.status-text').textContent = 'Live';
  };

  state.ws.onclose = () => {
    DOM.wsStatus.classList.remove('connected');
    DOM.wsStatus.querySelector('.status-text').textContent = 'Offline';
    // Attempt reconnect after 5s
    setTimeout(connectWebSocket, 5000);
  };

  state.ws.onerror = (err) => {
    console.error('WebSocket Error:', err);
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Ensure the message belongs to current user
      if (!state.user || data.userId !== state.user.id) return;
      
      switch (data.type) {
        case 'TASK_CREATED':
          // Add to local state if not exists
          if (!state.tasks.some(t => t.id === data.task.id)) {
            state.tasks.push(data.task);
            showToast('Task Created', `"${data.task.title}" added from another session`, 'success');
            renderApp();
          }
          break;
        case 'TASK_UPDATED':
          const idx = state.tasks.findIndex(t => t.id === data.task.id);
          if (idx !== -1) {
            state.tasks[idx] = data.task;
            showToast('Task Updated', `"${data.task.title}" sync complete`, 'info');
            renderApp();
          }
          break;
        case 'TASK_DELETED':
          const originalLength = state.tasks.length;
          state.tasks = state.tasks.filter(t => t.id !== data.taskId);
          if (state.tasks.length < originalLength) {
            showToast('Task Deleted', 'A task was deleted from another session', 'warning');
            renderApp();
          }
          break;
      }
    } catch (e) {
      console.error('WebSocket msg parsing error:', e);
    }
  };
}

// ================= API CALL HELPERS =================
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(endpoint, options);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// ================= AUTHENTICATION ACTIONS =================
function showRegisterForm(e) {
  e.preventDefault();
  DOM.loginForm.classList.remove('active');
  DOM.registerForm.classList.add('active');
  DOM.loginError.style.display = 'none';
}

function showLoginForm(e) {
  e.preventDefault();
  DOM.registerForm.classList.remove('active');
  DOM.loginForm.classList.add('active');
  DOM.registerError.style.display = 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  DOM.loginError.style.display = 'none';

  try {
    const data = await apiCall('/api/auth/login', 'POST', { username, password });
    loginSuccess(data);
  } catch (err) {
    DOM.loginError.textContent = err.message;
    DOM.loginError.style.display = 'block';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  DOM.registerError.style.display = 'none';

  try {
    const data = await apiCall('/api/auth/register', 'POST', { username, password });
    loginSuccess(data);
    showToast('Welcome!', 'Account created successfully.', 'success');
  } catch (err) {
    DOM.registerError.textContent = err.message;
    DOM.registerError.style.display = 'block';
  }
}

function loginSuccess(data) {
  state.token = data.token;
  state.user = data.user;
  
  localStorage.setItem('zen_token', data.token);
  localStorage.setItem('zen_user', JSON.stringify(data.user));
  
  // Reset forms
  DOM.loginForm.reset();
  DOM.registerForm.reset();
  
  setupAppView();
}

function handleLogout() {
  state.token = null;
  state.user = null;
  state.tasks = [];
  
  localStorage.removeItem('zen_token');
  localStorage.removeItem('zen_user');
  
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  
  setupAuthView();
  showToast('Logged Out', 'You have been successfully signed out', 'info');
}

// ================= APPLICATION STATE CHANGERS =================
function setupAuthView() {
  DOM.appContainer.classList.add('hidden');
  DOM.authContainer.classList.remove('hidden');
  DOM.loginForm.classList.add('active');
  DOM.registerForm.classList.remove('active');
}

async function setupAppView() {
  DOM.authContainer.classList.add('hidden');
  DOM.appContainer.classList.remove('hidden');
  DOM.userDisplayName.textContent = state.user.username;
  
  connectWebSocket();
  await loadTasks();
}

async function loadTasks() {
  try {
    state.tasks = await apiCall('/api/tasks');
    populateCategoriesFilter();
    renderApp();
  } catch (err) {
    showToast('Error loading tasks', err.message, 'error');
    if (err.message.includes('expired') || err.message.includes('token')) {
      handleLogout();
    }
  }
}

// ================= RENDER INTERFACE =================
function populateCategoriesFilter() {
  const categories = new Set(state.tasks.map(t => t.category).filter(Boolean));
  const filter = DOM.categoryFilter;
  
  // Clear other options except first
  filter.innerHTML = '<option value="all">All Categories</option>';
  
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    filter.appendChild(option);
  });
}

function renderApp() {
  // Clear columns
  Object.values(DOM.cols).forEach(col => col.innerHTML = '');
  
  // Filter state
  const searchQuery = DOM.searchInput.value.toLowerCase();
  const priorityVal = DOM.priorityFilter.value;
  const categoryVal = DOM.categoryFilter.value;
  
  let filteredTasks = state.tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery) || 
                          task.description.toLowerCase().includes(searchQuery);
    const matchesPriority = priorityVal === 'all' || task.priority === priorityVal;
    const matchesCategory = categoryVal === 'all' || task.category === categoryVal;
    
    return matchesSearch && matchesPriority && matchesCategory;
  });

  // Counters for columns
  const counts = { todo: 0, in_progress: 0, review: 0, completed: 0 };
  
  filteredTasks.forEach(task => {
    counts[task.status] = (counts[task.status] || 0) + 1;
    const card = createTaskCard(task);
    const targetCol = DOM.cols[task.status];
    if (targetCol) {
      targetCol.appendChild(card);
    }
  });

  // Update column headers count
  Object.keys(DOM.counts).forEach(status => {
    DOM.counts[status].textContent = state.tasks.filter(t => t.status === status).length;
  });

  // Calculate & Render stats
  renderStats();
}

function renderStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter(t => t.status === 'completed').length;
  
  // Due soon calculation (due in next 3 days and not completed)
  const now = new Date();
  const limitDate = new Date();
  limitDate.setDate(now.getDate() + 3);
  
  const dueSoon = state.tasks.filter(t => {
    if (!t.dueDate || t.status === 'completed') return false;
    const d = new Date(t.dueDate);
    return d >= now && d <= limitDate;
  }).length;
  
  const rate = total === 0 ? 0 : Math.round((completed / total) * 100);
  
  DOM.stats.total.textContent = total;
  DOM.stats.completed.textContent = completed;
  DOM.stats.dueSoon.textContent = dueSoon;
  DOM.stats.rate.textContent = `${rate}%`;
}

function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = `task-card`;
  card.id = `task-${task.id}`;
  card.draggable = true;
  
  // Set up dragging listeners
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', task.id);
  });
  
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });

  // Date styling
  let dateHtml = '';
  if (task.dueDate) {
    const date = new Date(task.dueDate);
    const displayDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const isOverdue = new Date(task.dueDate + 'T23:59:59') < new Date() && task.status !== 'completed';
    const overdueClass = isOverdue ? 'overdue' : '';
    const icon = isOverdue ? 'fa-triangle-exclamation' : 'fa-calendar-days';
    dateHtml = `<div class="card-due-date ${overdueClass}"><i class="fa-solid ${icon}"></i> ${displayDate}</div>`;
  }

  // Checklist Calculations
  let checklistHtml = '';
  if (task.checklist && task.checklist.length > 0) {
    const checkedCount = task.checklist.filter(item => item.completed).length;
    const totalCount = task.checklist.length;
    const pct = Math.round((checkedCount / totalCount) * 100);
    
    checklistHtml = `
      <div class="card-checklist-summary">
        <div class="checklist-info-row">
          <span>Sub-tasks</span>
          <span>${checkedCount}/${totalCount} (${pct}%)</span>
        </div>
        <div class="checklist-progress-bar-bg">
          <div class="checklist-progress-bar-fill" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="card-top">
      <span class="category-tag">${escapeHTML(task.category || 'General')}</span>
      <span class="priority-badge ${task.priority}">${task.priority}</span>
    </div>
    <h4 class="card-title">${escapeHTML(task.title)}</h4>
    ${task.description ? `<p class="card-desc">${escapeHTML(task.description)}</p>` : ''}
    ${checklistHtml}
    <div class="card-bottom">
      ${dateHtml || '<div></div>'}
      <div class="card-actions">
        <button class="card-btn btn-edit" title="Edit Task" onclick="openEditTaskModal('${task.id}')">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="card-btn btn-delete" title="Delete Task" onclick="deleteTask('${task.id}')">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
  `;

  return card;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// ================= DRAG AND DROP HANDLERS =================
window.allowDrop = function(e) {
  e.preventDefault();
};

// Setup visual cues for columns
Object.values(DOM.cols).forEach(col => {
  col.addEventListener('dragenter', () => col.classList.add('drag-over'));
  col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
  col.addEventListener('drop', () => col.classList.remove('drag-over'));
});

window.drop = async function(e, newStatus) {
  e.preventDefault();
  const id = e.dataTransfer.getData('text/plain');
  const task = state.tasks.find(t => t.id === id);
  
  if (!task || task.status === newStatus) return;

  // Optimistic UI update
  const originalStatus = task.status;
  task.status = newStatus;
  renderApp();

  try {
    await apiCall(`/api/tasks/${id}`, 'PUT', { status: newStatus });
    showToast('Task Moved', `Moved "${task.title}" to ${newStatus.replace('_', ' ')}`, 'success');
  } catch (err) {
    // Revert status
    task.status = originalStatus;
    renderApp();
    showToast('Error updating status', err.message, 'error');
  }
};

// ================= TASK FORM / MODAL LOGIC =================
DOM.btnNewTask.addEventListener('click', () => {
  openCreateTaskModal();
});

function openCreateTaskModal() {
  DOM.modalTitleText.textContent = 'Create Task';
  DOM.taskForm.reset();
  DOM.taskFormId.value = '';
  state.activeChecklist = [];
  renderChecklistModal();
  DOM.taskModal.classList.remove('hidden');
  DOM.taskTitle.focus();
}

window.openEditTaskModal = function(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  DOM.modalTitleText.textContent = 'Edit Task';
  DOM.taskFormId.value = task.id;
  DOM.taskTitle.value = task.title;
  DOM.taskDesc.value = task.description || '';
  DOM.taskPriority.value = task.priority;
  DOM.taskCategory.value = task.category || 'General';
  DOM.taskDueDate.value = task.dueDate ? task.dueDate.split('T')[0] : '';
  DOM.taskStatus.value = task.status;

  state.activeChecklist = task.checklist ? [...task.checklist] : [];
  renderChecklistModal();

  DOM.taskModal.classList.remove('hidden');
  DOM.taskTitle.focus();
};

function closeModal() {
  DOM.taskModal.classList.add('hidden');
  DOM.taskForm.reset();
  state.activeChecklist = [];
}

DOM.btnCloseModal.addEventListener('click', closeModal);
DOM.btnCancelTask.addEventListener('click', closeModal);
DOM.taskModal.addEventListener('click', (e) => {
  if (e.target === DOM.taskModal) closeModal();
});

// Checklist item builder in Modal
DOM.btnAddChecklist.addEventListener('click', addChecklistItem);
DOM.checklistInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addChecklistItem();
  }
});

function addChecklistItem() {
  const text = DOM.checklistInput.value.trim();
  if (!text) return;

  state.activeChecklist.push({
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
    text,
    completed: false
  });

  DOM.checklistInput.value = '';
  renderChecklistModal();
}

function renderChecklistModal() {
  DOM.checklistItemsList.innerHTML = '';
  
  state.activeChecklist.forEach(item => {
    const li = document.createElement('li');
    li.className = 'checklist-item';
    
    li.innerHTML = `
      <div class="checklist-item-left">
        <input type="checkbox" ${item.completed ? 'checked' : ''} onchange="toggleChecklistItem('${item.id}')">
        <span class="${item.completed ? 'completed' : ''}">${escapeHTML(item.text)}</span>
      </div>
      <button type="button" class="btn-remove-item" onclick="removeChecklistItem('${item.id}')">
        <i class="fa-regular fa-trash-can"></i>
      </button>
    `;
    DOM.checklistItemsList.appendChild(li);
  });
}

window.toggleChecklistItem = function(itemId) {
  const item = state.activeChecklist.find(i => i.id === itemId);
  if (item) {
    item.completed = !item.completed;
    renderChecklistModal();
  }
};

window.removeChecklistItem = function(itemId) {
  state.activeChecklist = state.activeChecklist.filter(i => i.id !== itemId);
  renderChecklistModal();
};

// Submit Task Form (Save or Update)
DOM.taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const id = DOM.taskFormId.value;
  const title = DOM.taskTitle.value.trim();
  const description = DOM.taskDesc.value.trim();
  const priority = DOM.taskPriority.value;
  const category = DOM.taskCategory.value.trim() || 'General';
  const dueDate = DOM.taskDueDate.value || null;
  const status = DOM.taskStatus.value;
  const checklist = state.activeChecklist;

  if (!title) return;

  const payload = { title, description, priority, category, dueDate, status, checklist };

  try {
    if (id) {
      // Edit
      const updated = await apiCall(`/api/tasks/${id}`, 'PUT', payload);
      const index = state.tasks.findIndex(t => t.id === id);
      if (index !== -1) {
        state.tasks[index] = updated;
      }
      showToast('Task Saved', `Updated "${title}"`, 'success');
    } else {
      // Create
      const created = await apiCall('/api/tasks', 'POST', payload);
      state.tasks.push(created);
      showToast('Task Created', `Created "${title}"`, 'success');
    }
    
    populateCategoriesFilter();
    renderApp();
    closeModal();
  } catch (err) {
    showToast('Failed to save task', err.message, 'error');
  }
});

// Delete Task
window.deleteTask = async function(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  
  if (!confirm(`Are you sure you want to delete "${task.title}"?`)) return;

  // Optimistic UI deletion
  const index = state.tasks.findIndex(t => t.id === id);
  if (index === -1) return;
  
  const removedTask = state.tasks.splice(index, 1)[0];
  renderApp();

  try {
    await apiCall(`/api/tasks/${id}`, 'DELETE');
    showToast('Task Deleted', `Removed "${removedTask.title}"`, 'warning');
    populateCategoriesFilter();
  } catch (err) {
    // Rollback
    state.tasks.splice(index, 0, removedTask);
    renderApp();
    showToast('Error deleting task', err.message, 'error');
  }
};

// ================= INPUT LISTENERS =================
DOM.searchInput.addEventListener('input', renderApp);
DOM.priorityFilter.addEventListener('change', renderApp);
DOM.categoryFilter.addEventListener('change', renderApp);

// ================= APP INITIALIZATION =================
function init() {
  initTheme();
  
  // Form submits
  DOM.loginForm.addEventListener('submit', handleLogin);
  DOM.registerForm.addEventListener('submit', handleRegister);
  
  // Auth view toggles
  DOM.goToRegister.addEventListener('click', showRegisterForm);
  DOM.goToLogin.addEventListener('click', showLoginForm);
  
  // Logout
  DOM.logoutBtn.addEventListener('click', handleLogout);

  if (state.token && state.user) {
    setupAppView();
  } else {
    setupAuthView();
  }
}

// Kickoff
init();
