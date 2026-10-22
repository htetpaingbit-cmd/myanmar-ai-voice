// --- IndexedDB Configuration ---
const DB_NAME = 'MyanmarTTS_Database';
const DB_VERSION = 2;
const STORE_HISTORY = 'audio_history';
const STORE_PROFILE = 'voice_profile';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_HISTORY)) {
                db.createObjectStore(STORE_HISTORY, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_PROFILE)) {
                db.createObjectStore(STORE_PROFILE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// History DB
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
        req.onsuccess = () => resolve(req.result.sort((a, b) => b.id - a.id));
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

// Voice Profile DB
async function saveUserVoiceProfile(blob) {
    const db = await openDB();
    const tx = db.transaction(STORE_PROFILE, 'readwrite');
    tx.objectStore(STORE_PROFILE).put({ id: 'my_voice', audioBlob: blob, date: new Date().toLocaleDateString() });
    return tx.complete;
}

async function getUserVoiceProfile() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_PROFILE, 'readonly');
        const req = tx.objectStore(STORE_PROFILE).get('my_voice');
        req.onsuccess = () => resolve(req.result);
    });
}

async function deleteUserVoiceProfile() {
    const db = await openDB();
    const tx = db.transaction(STORE_PROFILE, 'readwrite');
    tx.objectStore(STORE_PROFILE).delete('my_voice');
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
const voiceCards = document.querySelectorAll('.voice-card');

const historyList = document.getElementById('historyList');
const emptyHistoryText = document.getElementById('emptyHistoryText');
const clearAllHistoryBtn = document.getElementById('clearAllHistoryBtn');

const recordBtn = document.getElementById('recordBtn');
const recordIcon = document.getElementById('recordIcon');
const recordText = document.getElementById('recordText');
const userAudioPreview = document.getElementById('userAudioPreview');
const voiceProfileStatus = document.getElementById('voiceProfileStatus');
const deleteVoiceProfileBtn = document.getElementById('deleteVoiceProfileBtn');

let currentAudioBlob = null;
let currentAudioBuffer = null;
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

// UI Voice Card Selector
voiceCards.forEach(card => {
    card.addEventListener('click', () => {
        voiceCards.forEach(c => {
            c.className = 'flex items-center gap-3 p-3.5 border border-slate-200 bg-slate-50 rounded-xl cursor-pointer hover:bg-blue-50 transition voice-card';
        });
        card.className = 'flex items-center gap-3 p-3.5 border-2 border-blue-600 bg-blue-50/60 rounded-xl cursor-pointer hover:bg-blue-50 transition voice-card';
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

// --- Main Audio Generate Action ---
generateBtn.addEventListener('click', async () => {
    const text = textInput.value.trim();
    const selectedVoiceProfile = document.querySelector('input[name="voiceRadio"]:checked').value;
    
    const voiceNames = {
        explainer_female: 'May Thu (Explainer)',
        explainer_male: 'Min Khant (Tech Guide)',
        nilar_standard: 'Nilar (Storyteller)',
        thiha_standard: 'Thiha (Professional)'
    };
    const voiceName = voiceNames[selectedVoiceProfile] || 'May Thu';

    if (!text) {
        alert('Please enter or paste some text first!');
        textInput.focus();
        return;
    }

    generateBtn.disabled = true;
    generateSpinner.classList.remove('hidden');
    generateBtnText.innerText = 'Generating AI Voice... Please wait';
    audioResultCard.classList.add('hidden');

    try {
        const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, voiceProfile: selectedVoiceProfile })
        });

        if (!res.ok) throw new Error('Audio generation failed on server');

        currentAudioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(currentAudioBlob);

        // Web Audio Decode for WAV converter
        const arrayBuf = await currentAudioBlob.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        currentAudioBuffer = await audioCtx.decodeAudioData(arrayBuf);

        audioPlayer.src = audioUrl;
        audioPlayer.playbackRate = currentSpeed;
        audioResultCard.classList.remove('hidden');
        audioPlayer.play();

        // History
        const historyItem = {
            id: Date.now(),
            text: text.slice(0, 70) + (text.length > 70 ? '...' : ''),
            fullText: text,
            voiceName: voiceName,
            date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            audioBlob: currentAudioBlob
        };
        await saveToHistory(historyItem);
        renderHistory();

    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        generateBtn.disabled = false;
        generateSpinner.classList.add('hidden');
        generateBtnText.innerText = 'Generate AI Voice';
    }
});

// AudioBuffer to WAV Blob
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
    setUint16(1); // PCM
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
}

downloadMp3Btn.addEventListener('click', () => {
    if (currentAudioBlob) {
        triggerDownload(currentAudioBlob, `myanmar-ai-${Date.now()}.mp3`);
    }
});

downloadWavBtn.addEventListener('click', () => {
    if (currentAudioBuffer) {
        const wav = audioBufferToWavBlob(currentAudioBuffer);
        triggerDownload(wav, `myanmar-ai-${Date.now()}.wav`);
    }
});

// History List
async function renderHistory() {
    const list = await getAllHistory();
    historyList.innerHTML = '';

    if (list.length === 0) {
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
                    <span class="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded text-[10px]">${item.voiceName || 'May Thu'}</span>
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

    const arrayBuf = await currentAudioBlob.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    currentAudioBuffer = await audioCtx.decodeAudioData(arrayBuf);

    audioPlayer.src = url;
    audioPlayer.playbackRate = currentSpeed;
    audioResultCard.classList.remove('hidden');
    audioPlayer.play();
};

window.removeItem = async (id) => {
    await deleteHistoryItem(id);
    renderHistory();
};

clearAllHistoryBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all history?')) {
        await clearAllHistory();
        renderHistory();
    }
});

// Voice Profile Logic
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

async function loadSavedVoiceProfile() {
    const profile = await getUserVoiceProfile();
    if (profile && profile.audioBlob) {
        userAudioPreview.src = URL.createObjectURL(profile.audioBlob);
        userAudioPreview.classList.remove('hidden');
        deleteVoiceProfileBtn.classList.remove('hidden');
        voiceProfileStatus.innerText = '✅ Profile Saved';
        voiceProfileStatus.className = 'text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-bold border border-green-200';
    } else {
        userAudioPreview.classList.add('hidden');
        deleteVoiceProfileBtn.classList.add('hidden');
        voiceProfileStatus.innerText = 'No Voice Profile';
        voiceProfileStatus.className = 'text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium';
    }
}

recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            recordedChunks = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.onstop = async () => {
                const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                await saveUserVoiceProfile(blob);
                loadSavedVoiceProfile();
                stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorder.start();
            isRecording = true;
            recordText.innerText = 'Stop & Save';
            recordIcon.classList.add('recording-pulse');
        } catch (err) {
            alert('Microphone access denied: ' + err.message);
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recordText.innerText = 'Record Again';
        recordIcon.classList.remove('recording-pulse');
    }
});

deleteVoiceProfileBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete your voice profile?')) {
        await deleteUserVoiceProfile();
        loadSavedVoiceProfile();
    }
});

window.addEventListener('DOMContentLoaded', () => {
    renderHistory();
    loadSavedVoiceProfile();
});