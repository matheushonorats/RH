export function parseAFD(content) {
    const lines = content.split(/\r?\n/);
    const employees = new Map(); // PIS -> Name
    const punches = []; // Array of { pis, datetime, clock }
    let currentClock = "Desconhecido";

    // Regex patterns
    // Type 3 Classic: 9 chars NSR, '3', 8 chars date (DDMMYYYY), 4 chars time (HHMM), 11-12 chars PIS
    // Format: 000000199 3 14042023 1301 020921969311
    
    // Type 3 REP-C: 9 chars NSR, '3', 24 chars ISO date, 11-12 chars PIS
    // Format: 000003049 3 2026-04-16T08:26:00-0300 17635379860

    for (const line of lines) {
        if (!line || line.length < 10) continue;

        const type = line.charAt(9); // Position 9 is the type

        if (type === '1') {
            // Header - try to extract clock info (CNPJ or REP num)
            // It varies, but we can just use the first 14 chars after type as an ID
            if (line.length > 25) {
                currentClock = line.substring(10, 24).trim();
            }
        } 
        else if (type === '5' || type === '4') {
            // Employee info
            // Classic: pos 22 is I/A/E
            // REP-C: pos 34 is I/A/E
            let actionCharPos = line.indexOf('I', 10);
            if (actionCharPos === -1) actionCharPos = line.indexOf('A', 10);
            
            if (actionCharPos !== -1) {
                const pis = line.substring(actionCharPos + 1, actionCharPos + 13).trim();
                const name = line.substring(actionCharPos + 13, actionCharPos + 65).trim();
                if (pis && name && name !== 'teste') {
                    employees.set(pis, name);
                }
            }
        }
        else if (type === '3') {
            // Punch record
            const isRepC = line.substring(10, 14).includes('-'); // 2026-04...
            let pis = "";
            let datetime = null;

            if (isRepC) {
                // REP-C ISO Date
                const dateStr = line.substring(10, 34); // 2026-04-16T08:26:00-0300
                pis = line.substring(34, 46).trim();
                datetime = new Date(dateStr);
            } else {
                // Classic
                const day = line.substring(10, 12);
                const month = line.substring(12, 14);
                const year = line.substring(14, 18);
                const hour = line.substring(18, 20);
                const min = line.substring(20, 22);
                pis = line.substring(22, 34).trim();
                
                // Construct ISO to parse correctly in local timezone
                datetime = new Date(`${year}-${month}-${day}T${hour}:${min}:00`);
            }

            if (pis && datetime && !isNaN(datetime.getTime())) {
                punches.push({
                    pis,
                    datetime,
                    clock: currentClock
                });
            }
        }
    }

    return { employees, punches };
}
