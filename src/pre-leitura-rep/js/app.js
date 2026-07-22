import { parseAFD } from './parser.js';
import { processData, formatHours } from './calculator.js';

// Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const resultsContainer = document.getElementById('resultsContainer');
const servidoresList = document.getElementById('servidoresList');
const searchInput = document.getElementById('searchInput');
const filterStatus = document.getElementById('filterStatus');
const btnExport = document.getElementById('btnExport');

let processedData = []; // Store the full data to enable filtering

// Event Listeners for Upload
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

// Filters
searchInput.addEventListener('input', renderList);
filterStatus.addEventListener('change', renderList);
btnExport.addEventListener('click', exportToExcel);

async function handleFiles(files) {
    if (!files.length) return;

    let allEmployees = new Map();
    let allPunches = [];

    // Read all files
    for (const file of files) {
        const text = await file.text();
        const { employees, punches } = parseAFD(text);
        
        // Merge
        for (const [pis, nome] of employees.entries()) {
            allEmployees.set(pis, nome);
        }
        allPunches.push(...punches);
    }

    // Process
    processedData = processData(allEmployees, allPunches);

    // Update Dashboard
    updateDashboard();

    // Render List
    renderList();

    // Show Results
    uploadZone.style.display = 'none';
    resultsContainer.style.display = 'block';
    btnExport.style.display = 'inline-flex';
}

function updateDashboard() {
    document.getElementById('totalServidores').textContent = processedData.length;
    
    let totaisMarcacoes = 0;
    let totaisPendencias = 0;
    let totaisVR = 0;

    processedData.forEach(emp => {
        totaisMarcacoes += emp.dias.reduce((sum, dia) => sum + dia.batidas.length, 0);
        totaisPendencias += emp.resumo.pendencias;
        totaisVR += emp.resumo.vr;
    });

    document.getElementById('totalMarcacoes').textContent = totaisMarcacoes;
    document.getElementById('totalPendencias').textContent = totaisPendencias;
    document.getElementById('totalVR').textContent = totaisVR;
}

function renderList() {
    const searchTerm = searchInput.value.toLowerCase();
    const statusFilter = filterStatus.value;
    
    servidoresList.innerHTML = '';
    const template = document.getElementById('servidorTemplate');

    const filtered = processedData.filter(emp => {
        const matchesSearch = emp.nome.toLowerCase().includes(searchTerm) || emp.pis.includes(searchTerm);
        
        let matchesStatus = true;
        if (statusFilter === 'pending') {
            matchesStatus = emp.resumo.pendencias > 0;
        } else if (statusFilter === 'extra') {
            matchesStatus = emp.resumo.extras > 0;
        }

        return matchesSearch && matchesStatus;
    });

    filtered.forEach(emp => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.servidor-card');
        
        // Header
        clone.querySelector('.nome').textContent = emp.nome;
        clone.querySelector('.pis-badge').textContent = `PIS: ${emp.pis}`;
        clone.querySelector('.trabalhadas').textContent = formatHours(emp.resumo.trabalhadas) + 'h';
        clone.querySelector('.extras').textContent = formatHours(emp.resumo.extras) + 'h';
        clone.querySelector('.vr').textContent = emp.resumo.vr;

        if (emp.resumo.extras > 0) clone.querySelector('.extras').classList.add('text-success');
        if (emp.resumo.extras < 0) clone.querySelector('.extras').classList.add('text-error');
        if (emp.resumo.pendencias > 0) card.style.borderColor = 'var(--error)';

        // Toggle
        const header = clone.querySelector('.servidor-header');
        const body = clone.querySelector('.servidor-body');
        header.addEventListener('click', () => {
            const isExpanded = card.classList.contains('expanded');
            card.classList.toggle('expanded');
            body.style.display = isExpanded ? 'none' : 'block';
        });

        // Table
        const tbody = clone.querySelector('tbody');
        emp.dias.forEach(dia => {
            const tr = document.createElement('tr');
            
            // Format status
            let statusHtml = '<span class="status-badge status-ok">OK</span>';
            if (dia.isImpar) statusHtml = '<span class="status-badge status-pendencia">Batida Ímpar (Verificar)</span>';
            else if (dia.extraDia > 0) statusHtml = '<span class="status-badge status-extra">Hora Extra</span>';
            else if (dia.extraDia < 0) statusHtml = '<span class="status-badge status-pendencia">Falta/Atraso</span>';

            tr.innerHTML = `
                <td>${dia.dataFormatada}</td>
                <td>${dia.batidas.join(' - ')}</td>
                <td>${dia.isImpar ? '-' : formatHours(dia.totalDia) + 'h'}</td>
                <td class="${dia.extraDia > 0 ? 'text-success' : (dia.extraDia < 0 ? 'text-error' : '')}">
                    ${dia.isImpar ? '-' : formatHours(dia.extraDia) + 'h'}
                </td>
                <td>${dia.isImpar ? '-' : (dia.totalDia >= 6 ? '1' : '0')}</td>
                <td style="font-size: 0.75rem; color: var(--text-secondary)">${dia.relogios}</td>
                <td>${statusHtml}</td>
            `;
            tbody.appendChild(tr);
        });

        servidoresList.appendChild(clone);
    });
}

function exportToExcel() {
    if (!processedData.length) return alert('Não há dados para exportar.');

    // Flatten data for excel
    const rows = [];
    
    for (const emp of processedData) {
        for (const dia of emp.dias) {
            rows.push({
                'Nome': emp.nome,
                'PIS': emp.pis,
                'Data': dia.dataFormatada,
                'Batidas': dia.batidas.join(' - '),
                'Total Horas Dia': dia.isImpar ? 'Pendência' : formatHours(dia.totalDia),
                'Horas Extras/Débito': dia.isImpar ? 'Pendência' : formatHours(dia.extraDia),
                'Vale Refeição': dia.isImpar ? 'Pendência' : (dia.totalDia >= 6 ? 1 : 0),
                'Relógios Utilizados': dia.relogios,
                'Status': dia.isImpar ? 'Ímpar' : 'Completo'
            });
        }
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pré-Leitura Ponto");

    // Auto-size columns slightly
    const wscols = [
        {wch: 40}, // Nome
        {wch: 15}, // PIS
        {wch: 12}, // Data
        {wch: 25}, // Batidas
        {wch: 15}, // Total
        {wch: 20}, // Extra
        {wch: 15}, // VR
        {wch: 20}, // Relogios
        {wch: 10}  // Status
    ];
    ws['!cols'] = wscols;

    XLSX.writeFile(wb, "Pre_Leitura_Ponto_RH.xlsx");
}
