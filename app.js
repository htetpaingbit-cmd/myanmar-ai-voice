// --- IndexedDB Configuration ---
const DB_NAME = 'MyanmarAI_Studio_DB';
const DB_VERSION = 1;
const STORE_HISTORY = 'generation_history';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_HISTORY)) {
                db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveToHistory(record) {
    const db = await openDB();
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    tx.objectStore(STORE_HISTORY).put(record);
    return tx.complete;
}

async function getAllHistory() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_HISTORY, 'readonly');
        const req = tx.objectStore(STORE_HISTORY).getAll();
        req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.id - a.id));
        req.onerror = () => resolve([]);
    });
}

async function deleteHistoryItem(id) {
    const db = await openDB();
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    tx.objectStore(STORE_HISTORY).delete(id);
    return tx.complete;
}

async function clearAllHistory() {
    const db = await openDB();
    const tx = db.transaction(STORE_HISTORY, 'readwrite');
    tx.objectStore(STORE_HISTORY).clear();
    return tx.complete;
}

// DOM Elements
const textInput = document.getElementById('textInput');
const charCount = document.getElementById('charCount');
const clearBtn = document.getElementById('clearBtn');
const generateBtn = document.getElementById('generateBtn');
const generateBtnText = document.getElementById('generateBtnText');
const generateSpinner = document.getElementById('generateSpinner');
const audioResultCard = document.getElementById('audioResultCard');
const timeTracker = document.getElementById('timeTracker');
const audioPlayer = document.getElementById('audioPlayer');
const downloadMp3Btn = document.getElementById('downloadMp3Btn');
const downloadWavBtn = document.getElementById('downloadWavBtn');
const speedButtons = document.querySelectorAll('.speed-btn');

const genderCards = document.querySelectorAll('.gender-card');
const personaCards = document.querySelectorAll('.persona-card');

const historyList = document.getElementById('historyList');
const emptyHistoryText = document.getElementById('emptyHistoryText');
const clearAllHistoryBtn = document.getElementById('clearAllHistoryBtn');

let currentAudioBlob = null;
let currentSpeed = 1.0;

function formatSeconds(sec) {
    if (isNaN(sec) || sec === Infinity) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

audioPlayer.addEventListener('timeupdate', () => {
    timeTracker.innerText = `${formatSeconds(audioPlayer.currentTime)} / ${formatSeconds(audioPlayer.duration)}`;
});

audioPlayer.addEventListener('loadedmetadata', () => {
    timeTracker.innerText = `00:00 / ${formatSeconds(audioPlayer.duration)}`;
});

textInput.addEventListener('input', () => {
    charCount.innerText = `${textInput.value.length} characters`;
});

clearBtn.addEventListener('click', () => {
    textInput.value = '';
    charCount.innerText = '0 characters';
});

// Gender Selection Card styling
genderCards.forEach(card => {
    card.addEventListener('click', () => {
        genderCards.forEach(c => {
            c.className = 'gender-card flex items-center justify-center gap-2 p-3 border border-slate-200 bg-slate-50 rounded-xl cursor-pointer transition';
            const span = c.querySelector('span');
            if (span) span.className = 'font-bold text-sm text-slate-700';
        });
        card.className = 'gender-card flex items-center justify-center gap-2 p-3 border-2 border-blue-600 bg-blue-50/70 rounded-xl cursor-pointer transition';
        const activeSpan = card.querySelector('span');
        if (activeSpan) activeSpan.className = 'font-bold text-sm text-blue-900';
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
    });
});

// Persona Card Selection styling
personaCards.forEach(card => {
    card.addEventListener('click', () => {
        personaCards.forEach(c => {
            c.className = 'persona-card p-3 border border-slate-200 bg-slate-50 rounded-xl cursor-pointer hover:bg-blue-50 transition block';
            const titleDiv = c.querySelector('div:first-of-type');
            if (titleDiv) titleDiv.className = 'flex items-center gap-2 font-bold text-xs text-slate-800';
        });
        card.className = 'persona-card p-3 border-2 border-blue-600 bg-blue-50/60 rounded-xl cursor-pointer transition block';
        const activeTitle = card.querySelector('div:first-of-type');
        if (activeTitle) activeTitle.className = 'flex items-center gap-2 font-bold text-xs text-blue-950';
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
    });
});

// Speed Controls
speedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        speedButtons.forEach(b => b.className = 'speed-btn px-2.5 py-1 text-xs bg-white border border-slate-300 rounded hover:bg-blue-50');
        btn.className = 'speed-btn px-2.5 py-1 text-xs bg-blue-600 text-white font-bold rounded';
        currentSpeed = parseFloat(btn.dataset.speed);
        audioPlayer.playbackRate = currentSpeed;
    });
});

// TTS Generation Action (Safe across mobile and all browsers)
generateBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    const gender = document.querySelector('input[name="genderRadio"]:checked').value;
    const persona = document.querySelector('input[name="personaRadio"]:checked').value;

    if (!text) {
        alert('Please enter or paste some Burmese text first!');
        textInput.focus();
        return;
    }

    generateBtn.disabled = true;
    generateSpinner.classList.remove('hidden');
    generateBtnText.innerText = 'Generating Voice... Please wait';
    audioResultCard.classList.add('hidden');

    try {
        const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, gender, persona })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Server responded with status ${res.status}`);
        }

        currentAudioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(currentAudioBlob);

        audioPlayer.src = audioUrl;
        audioPlayer.playbackRate = currentSpeed;
        audioResultCard.classList.remove('hidden');

        // Safe playback without failing on mobile autoplay policies
        audioPlayer.play().catch(() => {
            console.log("Autoplay was prevented by browser policy; user can click play manually.");
        });

        // Save to IndexedDB history
        const personaLabel = persona.charAt(0).toUpperCase() + persona.slice(1);
        const historyItem = {
            id: Date.now(),
            text: text.slice(0, 75) + (text.length > 75 ? '...' : ''),
            fullText: text,
            gender: gender,
            persona: personaLabel,
            date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            audioBlob: currentAudioBlob
        };
        await saveToHistory(historyItem);
        renderHistory();

    } catch (err) {
        alert('Generation Error: ' + err.message);
    } finally {
        generateBtn.disabled = false;
        generateSpinner.classList.add('hidden');
        generateBtnText.innerText = 'Generate AI Voice';
    }
});

// AudioBuffer to WAV Converter
function audioBufferToWavBlob(buffer) {
    const numOfChan = 1;
    const length = buffer.length * 2 + 44;
    const out = new DataView(new ArrayBuffer(length));
    const sampleRate = buffer.sampleRate;
    let pos = 0;

    function setUint16(d) { out.setUint16(pos, d, true); pos += 2; }
    function setUint32(d) { out.setUint32(pos, d, true); pos += 4; }

    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8);
    setUint32(0x45564157); // "WAVE"
    setUint32(0x20746d66); // "fmt "
    setUint32(16);
    setUint16(1);          // PCM
    setUint16(numOfChan);
    setUint32(sampleRate);
    setUint32(sampleRate * 2);
    setUint16(2);
    setUint16(16);
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < channelData.length; i++) {
        let sample = Math.max(-1, Math.min(1, channelData[i]));
        out.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        pos += 2;
    }
    return new Blob([out], { type: 'audio/wav' });
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

downloadMp3Btn.addEventListener('click', () => {
    if (currentAudioBlob) {
        triggerDownload(currentAudioBlob, `myanmar-ai-${Date.now()}.mp3`);
    }
});

// Lazy WAV generation only when downloaded
downloadWavBtn.addEventListener('click', async () => {
    if (!currentAudioBlob) return;
    try {
        downloadWavBtn.innerText = 'Converting...';
        const arrayBuf = await currentAudioBlob.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const buffer = await audioCtx.decodeAudioData(arrayBuf);
        const wav = audioBufferToWavBlob(buffer);
        triggerDownload(wav, `myanmar-ai-${Date.now()}.wav`);
    } catch (e) {
        alert('WAV conversion error: ' + e.message);
    } finally {
        downloadWavBtn.innerText = '⬇️ Download WAV';
    }
});

// History Render
async function renderHistory() {
    const list = await getAllHistory();
    historyList.innerHTML = '';

    if (!list || list.length === 0) {
        emptyHistoryText.classList.remove('hidden');
        historyList.appendChild(emptyHistoryText);
        return;
    }

    emptyHistoryText.classList.add('hidden');

    list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs';
        card.innerHTML = `
            <div class="space-y-1 flex-1">
                <div class="flex items-center gap-2">
                    <span class="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded text-[10px] uppercase">${item.gender || 'Female'} - ${item.persona || 'Presenter'}</span>
                    <span class="text-slate-400 text-[10px]">${item.date}</span>
                </div>
                <p class="text-slate-700 font-medium text-xs line-clamp-1">${item.text}</p>
            </div>
            <div class="flex items-center gap-1.5">
                <button onclick="playHistoryItem(${item.id})" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition">Play ▶️</button>
                <button onclick="removeItem(${item.id})" class="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-red-50 text-red-500">🗑️</button>
            </div>
        `;
        historyList.appendChild(card);
    });
}

window.playHistoryItem = async (id) => {
    const list = await getAllHistory();
    const item = list.find(i => i.id === id);
    if (!item || !item.audioBlob) return;

    currentAudioBlob = item.audioBlob;
    const url = URL.createObjectURL(currentAudioBlob);

    audioPlayer.src = url;
    audioPlayer.playbackRate = currentSpeed;
    audioResultCard.classList.remove('hidden');
    audioPlayer.play().catch(() => {});
};

window.removeItem = async (id) => {
    await deleteHistoryItem(id);
    renderHistory();
};

clearAllHistoryBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete all generation history?')) {
        await clearAllHistory();
        renderHistory();
    }
});

window.addEventListener('DOMContentLoaded', () => {
    renderHistory();
});