// Helper: Round time based on user rules
// xx:00 to xx:15 -> xx:00
// xx:16 to xx:45 -> xx:30
// xx:46 to xx:59 -> yy:00
function roundTime(dateObj) {
    const min = dateObj.getMinutes();
    const rounded = new Date(dateObj.getTime());
    
    if (min <= 15) {
        rounded.setMinutes(0);
    } else if (min <= 45) {
        rounded.setMinutes(30);
    } else {
        rounded.setHours(rounded.getHours() + 1);
        rounded.setMinutes(0);
    }
    rounded.setSeconds(0);
    rounded.setMilliseconds(0);
    return rounded;
}

// Convert Date to yyyy-mm-dd
function toDateString(dateObj) {
    return dateObj.toISOString().split('T')[0];
}

// Calculate hours difference between two dates
function getHoursDiff(start, end) {
    return (end - start) / (1000 * 60 * 60);
}

// Format hours into HH:MM
export function formatHours(decimalHours) {
    const isNegative = decimalHours < 0;
    const absHours = Math.abs(decimalHours);
    const h = Math.floor(absHours);
    const m = Math.round((absHours - h) * 60);
    const sign = isNegative ? '-' : '';
    return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function processData(employees, punches) {
    // Group by PIS
    const dataByPis = new Map();

    // Sort all punches chronologically to ensure correct order
    punches.sort((a, b) => a.datetime - b.datetime);

    for (const punch of punches) {
        const pis = punch.pis;
        // Ignore if we don't have a name, though we could keep it as unknown
        if (!employees.has(pis)) continue;

        if (!dataByPis.has(pis)) {
            dataByPis.set(pis, {
                pis: pis,
                nome: employees.get(pis),
                dias: new Map(),
                resumo: {
                    trabalhadas: 0,
                    extras: 0,
                    vr: 0,
                    pendencias: 0
                }
            });
        }

        const employeeData = dataByPis.get(pis);
        // We round the punch time for calculations, but keep original for display if we want
        const roundedTime = roundTime(punch.datetime);
        const dateStr = toDateString(roundedTime);

        if (!employeeData.dias.has(dateStr)) {
            employeeData.dias.set(dateStr, {
                data: dateStr,
                batidas: [],
                relogios: new Set()
            });
        }

        const dayData = employeeData.dias.get(dateStr);
        dayData.batidas.push(roundedTime);
        if (punch.clock) dayData.relogios.add(punch.clock);
    }

    // Process calculations for each employee
    const resultList = [];
    const JORNADA_PADRAO = 8;
    const HORAS_VR = 6;

    for (const emp of dataByPis.values()) {
        const diasArr = Array.from(emp.dias.values());
        
        // Sort days
        diasArr.sort((a, b) => a.data.localeCompare(b.data));

        const diasProcessados = [];

        for (const dia of diasArr) {
            const batidas = dia.batidas;
            // Ensure ordered chronologically
            batidas.sort((a, b) => a - b);
            
            const isImpar = batidas.length % 2 !== 0;
            if (isImpar) {
                emp.resumo.pendencias++;
            }

            let horasTrabalhadas = 0;
            // Calculate pairs of punches
            for (let i = 0; i < batidas.length - 1; i += 2) {
                horasTrabalhadas += getHoursDiff(batidas[i], batidas[i+1]);
            }

            let extraDia = 0;
            // Only calculate extra if it's an even number of punches
            if (!isImpar) {
                extraDia = horasTrabalhadas - JORNADA_PADRAO;
                // Accumulate totals
                emp.resumo.trabalhadas += horasTrabalhadas;
                emp.resumo.extras += extraDia;
                
                // Vale Refeição
                if (horasTrabalhadas >= HORAS_VR) {
                    emp.resumo.vr += 1;
                }
            }

            // Status determination
            let status = 'ok';
            if (isImpar) status = 'pendencia';
            else if (extraDia > 0) status = 'extra';

            diasProcessados.push({
                dataOriginal: dia.data,
                dataFormatada: dia.data.split('-').reverse().join('/'),
                batidas: batidas.map(d => `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`),
                totalDia: horasTrabalhadas,
                extraDia: extraDia,
                relogios: Array.from(dia.relogios).join(', '),
                status: status,
                isImpar: isImpar
            });
        }

        resultList.push({
            pis: emp.pis,
            nome: emp.nome,
            dias: diasProcessados,
            resumo: emp.resumo
        });
    }

    // Sort employees alphabetically
    resultList.sort((a, b) => a.nome.localeCompare(b.nome));

    return resultList;
}
