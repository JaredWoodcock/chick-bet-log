let dailyPLChart;

// ==================== UTILITIES ====================

function formatDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function normalizeDateKey(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  const dt = new Date(s);
  return isNaN(dt) ? '' : dt.toISOString().slice(0,10);
}

function formatDateDisplay(s) {
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[2].padStart(2,'0')}/${m[3].padStart(2,'0')}/${m[1]}`;
  const dt = new Date(s);
  return isNaN(dt) ? s : `${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getDate().toString().padStart(2,'0')}/${dt.getFullYear()}`;
}

function parseNum(val) {
  if (val == null || val === '') return 0;
  return parseFloat(String(val).replace(/\$|,/g,'')) || 0;
}

function formatCurrency(val) {
  return '$' + parseNum(val).toFixed(2);
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[c]));
}

// ==================== FETCH & RENDER ====================

async function fetchData() {
  try {
    const [betsRes, singlesRes, parlaysRes, betTypesRes] = await Promise.all([
      fetch('/api/bets'),
      fetch('/api/singles'),
      fetch('/api/parlays'),
      fetch('/api/bettypes')
    ]);

    const betsData = await betsRes.json();
    const singlesData = await singlesRes.json();
    const parlaysData = await parlaysRes.json();
    const betTypesData = await betTypesRes.json();

    // Store betsData globally
    window.betsData = betsData;

    // Update current balance (all bets + credits)
    updateBalance(window.betsData);

    renderSimpleTable('#singles-table tbody', [singlesData]);
    renderSimpleTable('#parlays-table tbody', [parlaysData]);
    renderBetTypesTable(betTypesData);
    renderBetsTable(betsData);
    renderCreditsTable(betsData);

    // Populate Type filter dynamically
    const typeSet = new Set(betsData.map(b => (b.Type || '').toLowerCase()).filter(t => t && t !== 'credit'));
    typeSet.add('singles');
    const typeSelect = document.getElementById('type-filter');
    typeSelect.innerHTML = '<option value="">All</option>';
    [...typeSet].sort().forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      typeSelect.appendChild(opt);
    });

    // All Bets Apply filter
    document.getElementById('bets-filter-btn').addEventListener('click', () => {
      const type = typeSelect.value.toLowerCase();
      const result = document.getElementById('result-filter').value.toLowerCase();
      const start = normalizeDateKey(document.getElementById('bets-start-date').value);
      const end = normalizeDateKey(document.getElementById('bets-end-date').value);

      const filtered = window.betsData.filter(b => {
        const t = (b.Type || '').toLowerCase();
        const r = (b.Result || '').toLowerCase();
        const d = normalizeDateKey(b.Date);

        let typeMatch = true;
        if (type === 'singles') typeMatch = t !== 'parlay' && t !== 'credit';
        else if (type) typeMatch = t === type;

        const resultMatch = !result || r === result;
        const startMatch = !start || (d && d >= start);
        const endMatch = !end || (d && d <= end);

        return typeMatch && resultMatch && startMatch && endMatch;
      });

      renderBetsTable(filtered);
      document.getElementById('filter-dropdown').classList.add('hidden'); // close dropdown
    });

    // All Bets Clear filter
    document.getElementById('bets-clear-btn').addEventListener('click', () => {
      typeSelect.value = '';
      document.getElementById('result-filter').value = '';
      document.getElementById('bets-start-date').value = '';
      document.getElementById('bets-end-date').value = '';
      renderBetsTable(window.betsData);
      document.getElementById('filter-dropdown').classList.add('hidden'); // close dropdown
    });

    // Setup Daily P/L chart default range: current month
    const now = new Date();
    const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    document.getElementById('start-date').value = start;
    document.getElementById('end-date').value = end;

    updateChart(betsData, normalizeDateKey(start), normalizeDateKey(end));

  } catch (err) {
    console.error('Error fetching data:', err);
    document.getElementById('balance').textContent = 'Error';
  }
}

// ==================== BALANCE ====================

function updateBalance(betsData) {
  const balance = betsData.reduce((sum, b) => sum + parseNum(b.Balance), 0);
  const balanceEl = document.getElementById('balance');
  balanceEl.textContent = formatCurrency(balance);
  balanceEl.parentElement.style.color = balance < 0 ? 'red' : 'var(--accent)';
}

// ==================== TABLE RENDERING ====================

function renderSimpleTable(selector, rows) {
  const tbody = document.querySelector(selector);
  tbody.innerHTML = '';
  rows.forEach(data => {
    const tr = document.createElement('tr');
    data.forEach(val => {
      const td = document.createElement('td');
      td.textContent = val ?? '0';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderBetTypesTable(data) {
  const tbody = document.querySelector('#bettypes-table tbody');
  tbody.innerHTML = '';
  data.forEach(row => {
    const tr = document.createElement('tr');
    ['type','win_pct','wins','losses','avg_odds','expected_pct','totals'].forEach(col => {
      const td = document.createElement('td');
      td.textContent = row[col] ?? '0';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderBetsTable(betsData) {
  const tbody = document.querySelector('#bets-table tbody');
  tbody.innerHTML = '';

  betsData.sort((a,b) => new Date(b.Date) - new Date(a.Date));

  betsData.forEach(bet => {
    const type = (bet.Type || '').toLowerCase();
    if (type === 'credit' || type === 'deposit' || type === 'withdrawal') return;

    const isParlay = type === 'parlay';
    const tr = document.createElement('tr');
    tr.classList.add('bet-row');

    const toggleTd = document.createElement('td');
    if (isParlay) {
      toggleTd.textContent = '+';
      toggleTd.style.cursor = 'pointer';
    }
    tr.appendChild(toggleTd);

    ['Date','Bet','Stake','Odds','To_Win','Type','Result','Balance'].forEach(key => {
      const td = document.createElement('td');
      let val = bet[key] ?? '';
      if (['Stake','To_Win','Balance'].includes(key)) {
        val = formatCurrency(val);
        td.dataset.raw = parseNum(bet[key]);
      }
      td.textContent = val;
      tr.appendChild(td);
    });

    tr.dataset.Stake = parseNum(bet.Stake);
    tr.dataset.Odds = (bet.Odds ?? '').toString();
    tr.dataset.To_Win = parseNum(bet.To_Win);
    tr.dataset.Type = (bet.Type ?? '').toString();
    tr.dataset.Result = (bet.Result ?? '').toString();
    tr.dataset.Balance = parseNum(bet.Balance);
    tr.dataset.DateKey = normalizeDateKey(bet.Date || '');

    tbody.appendChild(tr);

    if (isParlay) {
      const nestedTr = document.createElement('tr');
      nestedTr.classList.add('nested-row');
      nestedTr.style.display = 'none';
      const nestedTd = document.createElement('td');
      nestedTd.colSpan = 9;
      nestedTd.innerHTML = '<em>Loading...</em>';
      nestedTr.appendChild(nestedTd);
      tbody.appendChild(nestedTr);

      toggleTd.addEventListener('click', async () => {
        if (nestedTr.style.display === 'none') {
          nestedTr.style.display = 'table-row';
          toggleTd.textContent = '-';
          try {
            const res = await fetch(`/api/parlay_bets?parlay_name=${encodeURIComponent(bet.Bet)}`);
            const parlayBets = await res.json();
            if (parlayBets.length > 0) {
              nestedTd.innerHTML = '<table class="nested"><thead><tr><th>Date</th><th>Bet</th><th>Odds</th><th>Type</th><th>Result</th></tr></thead><tbody>' +
                parlayBets.map(b => `<tr>
                  <td>${formatDateDisplay(b.date || b.Date)}</td>
                  <td>${escapeHtml(b.individual_bet || b.Bet || '')}</td>
                  <td>${escapeHtml(b.odds || '')}</td>
                  <td>${escapeHtml(b.type || '')}</td>
                  <td>${escapeHtml(b.result || '')}</td>
                </tr>`).join('') + '</tbody></table>';
            } else {
              nestedTd.innerHTML = '<em>No details</em>';
            }
          } catch (err) {
            nestedTd.innerHTML = '<em>Error loading</em>';
          }
        } else {
          nestedTr.style.display = 'none';
          toggleTd.textContent = '+';
        }
      });
    }
  });
}

function renderCreditsTable(betsData) {
  const tbody = document.querySelector('#credits-table tbody');
  tbody.innerHTML = '';

  betsData
    .filter(b => ['credit','deposit','withdrawal'].includes((b.Type || '').toLowerCase()))
    .sort((a,b) => new Date(b.Date) - new Date(a.Date))
    .forEach(c => {
      const tr = document.createElement('tr');
      const type = (c.Type || '').toLowerCase();
      tr.innerHTML = `
        <td>${c.Date}</td>
        <td>${c.Bet || type.charAt(0).toUpperCase() + type.slice(1)}</td>
        <td>${formatCurrency(c.Balance)}</td>
      `;
      tbody.appendChild(tr);
    });
}

// ==================== CHART ====================

function updateChart(betsData, startDate, endDate) {
  const dailyTotals = {};

  betsData.forEach(bet => {
    if ((bet.Type || '').toLowerCase() === 'credit') return;
    const d = normalizeDateKey(bet.Date);
    if (!d || (startDate && d < startDate) || (endDate && d > endDate)) return;

    const result = (bet.Result || '').toLowerCase();
    let dayPL = 0;
    if (result === 'win') dayPL = parseNum(bet.To_Win);
    else if (result === 'loss') dayPL = -parseNum(bet.Stake);

    dailyTotals[d] = (dailyTotals[d] || 0) + dayPL;
  });

  const dates = Object.keys(dailyTotals).sort();
  if (dates.length === 0) {
    renderChart([], []);
    return;
  }

  const labels = [''];
  const cumulative = [0];
  let running = 0;

  dates.forEach(d => {
    running += dailyTotals[d];
    cumulative.push(running);
    const [y, m, day] = d.split('-');
    labels.push(`${m}/${day}`);
  });

  renderChart(labels, cumulative);
}

function renderChart(labels, data) {
  const canvas = document.getElementById('daily-pl-chart');
  if (!canvas) return;

  if (dailyPLChart) {
    dailyPLChart.data.labels = labels;
    dailyPLChart.data.datasets[0].data = data;
    dailyPLChart.update();
    return;
  }

  dailyPLChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Cumulative P/L',
        data,
        borderColor: '#00b87c',
        backgroundColor: 'rgba(0,184,124,0.2)',
        fill: true,
        tension: 0.2,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top:5,right:5,bottom:0,left:5 } },
      scales: {
        x: { title:{display:true,text:'Date',padding:{top:5,bottom:0}}, ticks:{maxRotation:0,autoSkip:true,padding:5} },
        y: { title:{display:true,text:'Balance ($)',padding:{left:0,right:5}}, beginAtZero:false, ticks:{padding:5} }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// ==================== ALL BETS DROPDOWN ====================

const filterToggleBtn = document.getElementById("filter-toggle-btn");
const filterDropdown = document.getElementById("filter-dropdown");

filterToggleBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  filterDropdown.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (!filterDropdown.classList.contains("hidden") &&
      !filterDropdown.contains(e.target) &&
      !filterToggleBtn.contains(e.target)) {
    filterDropdown.classList.add("hidden");
  }
});

// ==================== DAILY P/L FILTER DROPDOWN ====================

const chartFilterToggleBtn = document.getElementById("chart-filter-toggle-btn");
const chartFilterDropdown = document.getElementById("chart-filter-dropdown");
const plApplyBtn = document.getElementById("pl-filter-apply-btn");
const plResetBtn = document.getElementById("pl-filter-reset-btn");
const startInput = document.getElementById("start-date");
const endInput = document.getElementById("end-date");

chartFilterToggleBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  chartFilterDropdown.classList.toggle("hidden");
});

plApplyBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const s = normalizeDateKey(startInput.value);
  const eDate = normalizeDateKey(endInput.value);
  updateChart(window.betsData, s, eDate);
  chartFilterDropdown.classList.add("hidden");
});

plResetBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const now = new Date();
  const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  startInput.value = start;
  endInput.value = end;
  updateChart(window.betsData, normalizeDateKey(start), normalizeDateKey(end));
  chartFilterDropdown.classList.add("hidden");
});

document.addEventListener("click", (e) => {
  if (!chartFilterDropdown.contains(e.target) && !chartFilterToggleBtn.contains(e.target)) {
    chartFilterDropdown.classList.add("hidden");
  }
});

// ==================== SORTING ====================

document.querySelectorAll('#bets-table th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const tbody = document.querySelector('#bets-table tbody');
    const key = th.dataset.key;
    if (!key) return;

    const dir = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';
    document.querySelectorAll('#bets-table th.sortable').forEach(h => {
      h.classList.remove('asc','desc');
      h.dataset.sortDir = '';
    });
    th.dataset.sortDir = dir;
    th.classList.add(dir);

    const betRows = Array.from(tbody.querySelectorAll('tr.bet-row'));
    const pairs = betRows.map(mainRow => ({
      mainRow,
      nestedRow: mainRow.nextElementSibling?.classList.contains('nested-row') ? mainRow.nextElementSibling : null
    }));

    pairs.sort((a,b) => {
      const aVal = a.mainRow.dataset[key] ?? '';
      const bVal = b.mainRow.dataset[key] ?? '';
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return dir === 'asc' ? aNum - bNum : bNum - aNum;
      return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    tbody.innerHTML = '';
    pairs.forEach(p => {
      tbody.appendChild(p.mainRow);
      if (p.nestedRow) tbody.appendChild(p.nestedRow);
    });
  });
});

// ==================== INIT ====================

fetchData();
