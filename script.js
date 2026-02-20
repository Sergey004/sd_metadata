const dropArea = document.getElementById('drop-area');
const dropArea = document.getElementById('drop-area');
const preview = document.getElementById('preview');
const promptPre = document.getElementById('prompt');
const negativePromptPre = document.getElementById('negative-prompt');
const parametersTable = document.getElementById('parameters-table');
const notification = document.getElementById('notification');
const resultsDiv = document.getElementById('results');
const editDropArea = document.getElementById('edit-drop-area');
const editPreview = document.getElementById('edit-preview');
const editPrompt = document.getElementById('edit-prompt');
const editNegativePrompt = document.getElementById('edit-negative-prompt');
const editParameters = document.getElementById('edit-parameters');
const saveButton = document.getElementById('save-changes');
const editNotification = document.getElementById('edit-notification');
const editForm = document.getElementById('edit-form');

const loraDropArea = document.getElementById('lora-drop-area');
const loraNotification = document.getElementById('lora-notification');
const loraResults = document.getElementById('lora-results');

const negativePrefix = 'Negative prompt: ';
const paramsPrefix = 'Steps: ';

let currentFile = null;
let currentMetadata = null;

function setupTabSwitching() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            const tabId = this.getAttribute('data-tab') + '-tab';
            document.getElementById(tabId).classList.add('active');
        });
    });
}

function setupDragAndDrop() {
    const highlight = () => dropArea.classList.add('drag-over');
    const unhighlight = () => dropArea.classList.remove('drag-over');
    const preventDefaults = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    dropArea.addEventListener('drop', handleDrop, false);
}

function setupEditDragAndDrop() {
    const highlight = () => editDropArea.classList.add('drag-over');
    const unhighlight = () => editDropArea.classList.remove('drag-over');
    const preventDefaults = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        editDropArea.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        editDropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        editDropArea.addEventListener(eventName, unhighlight, false);
    });

    editDropArea.addEventListener('drop', handleEditDrop, false);
}

function setupLoraDragAndDrop() {
    const highlight = () => loraDropArea.classList.add('drag-over');
    const unhighlight = () => loraDropArea.classList.remove('drag-over');
    const preventDefaults = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        loraDropArea.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        loraDropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        loraDropArea.addEventListener(eventName, unhighlight, false);
    });

    loraDropArea.addEventListener('drop', handleLoraDrop, false);
}

function setupFileInputs() {
    document.querySelectorAll('.drop-zone').forEach(zone => {
        const fileInput = zone.querySelector('.file-input');
        zone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) {
                const file = e.target.files[0];
                const tabId = zone.closest('.tab-content').id;
                if (tabId === 'view-tab') handleFile(file);
                else if (tabId === 'edit-tab') handleEditFile(file);
                else if (tabId === 'lora-tab') handleLoraFile(file);
            }
        });
    });
}

function setupCopyButtons() {
    document.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-target');
            const textToCopy = document.getElementById(targetId).textContent;
            copyToClipboard(textToCopy);
            const button = e.currentTarget;
            button.classList.add('copied');
            button.querySelector('span').textContent = 'Copied!';
            setTimeout(() => {
                button.classList.remove('copied');
                button.querySelector('span').textContent = 'Copy';
            }, 2000);
        });
    });
}

function setupSaveHandler() {
    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-lock"></i><span>Save & Download Image</span>';
}

function handleDrop(e) {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
}

function handleEditDrop(e) {
    const file = e.dataTransfer.files[0];
    if (file) handleEditFile(file);
}

function handleLoraDrop(e) {
    const file = e.dataTransfer.files[0];
    if (file) handleLoraFile(file);
}

async function handleFile(file) {
    if (!file.type.match('image.*')) {
        showNotification('Please select an image file (PNG, JPG, JPEG)', 'error');
        return;
    }

    try {
        await displayPreview(file);
        const metadata = await extractMetadata(file);
        displayMetadata(metadata);
        showNotification('File loaded successfully', 'success');
    } catch (error) {
        console.error('Error processing file:', error);
        showNotification('Error processing file: ' + error.message, 'error');
    }
}

async function handleEditFile(file) {
    if (!file.type.match('image.*')) {
        showEditNotification('Please select an image file (PNG, JPG, JPEG)', 'error');
        return;
    }

    try {
        currentFile = file;
        await displayEditPreview(file);
        const metadata = await extractMetadata(file);
        currentMetadata = metadata;
        populateEditFields(metadata);
        editForm.classList.remove('hidden');
        showEditNotification('File loaded for editing', 'success');
    } catch (error) {
        console.error('Error processing file:', error);
        showEditNotification('Error processing file: ' + error.message, 'error');
    }
}

async function handleLoraFile(file) {
    if (!file.name.endsWith('.safetensors')) {
        showLoraNotification('Please drop a valid .safetensors file', 'error');
        return;
    }

    try {
        const arrayBuffer = await file.slice(0, 8).arrayBuffer();
        const metadataSize = new DataView(arrayBuffer).getUint32(0, true);
        const metadataArrayBuffer = await file.slice(8, 8 + metadataSize).arrayBuffer();
        const header = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(metadataArrayBuffer)));
        const metadata = header['__metadata__'] || {};
        const normalizedMetadata = normalizeLoraMetadata(metadata);
        displayLoraMetadata(normalizedMetadata);
        loraResults.classList.remove('hidden');
        showLoraNotification('File loaded successfully', 'success');

        const sha256 = await calculateFileSha256(file);
        if (sha256) {
            const civitaiInfoCard = document.getElementById('civitai-info-card');
            const civitaiLoraResults = document.getElementById('civitai-lora-results');
            civitaiLoraResults.innerHTML = '<div class="civitai-loading"><i class="fas fa-spinner fa-spin"></i> Searching Civitai...</div>';
            civitaiInfoCard.style.display = 'block';

            try {
                const civitaiMetadata = await CivitaiClient.loadCivitaiInfoByHash(sha256, civitaiLoraResults);
                if (civitaiMetadata) {
                    showLoraNotification('Civitai info found!', 'success');
                }
            } catch (e) {
                console.warn('Civitai lookup failed:', e);
                civitaiLoraResults.innerHTML = '<p style="color: var(--text-muted);">No match found on Civitai</p>';
            }
        }
    } catch (error) {
        console.error('Error processing file:', error);
        showLoraNotification('Error processing file: ' + error.message, 'error');
    }
}

async function calculateFileSha256(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex.toLowerCase();
    } catch (error) {
        console.error('Error calculating SHA256:', error);
        return null;
    }
}

function displayPreview(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            resolve();
        };
        reader.readAsDataURL(file);
    });
}

function displayEditPreview(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            editPreview.src = e.target.result;
            resolve();
        };
        reader.readAsDataURL(file);
    });
}

async function extractMetadata(file) {
    if (file.type === 'image/png') {
        return extractPNGMetadata(file);
    } else if (file.type.match('image/jpeg')) {
        return extractJPEGMetadata(file);
    } else {
        throw new Error('Unsupported image format');
    }
}

function extractPNGMetadata(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const arrayBuffer = e.target.result;
                const dataView = new DataView(arrayBuffer);

                if (dataView.getUint32(0) !== 0x89504E47 || dataView.getUint32(4) !== 0x0D0A1A0A) {
                    reject(new Error('Not a valid PNG file'));
                    return;
                }

                let offset = 8;
                const metadata = { parameters: [] };

                while (offset < dataView.byteLength) {
                    const length = dataView.getUint32(offset);
                    const type = String.fromCharCode(
                        dataView.getUint8(offset + 4),
                        dataView.getUint8(offset + 5),
                        dataView.getUint8(offset + 6),
                        dataView.getUint8(offset + 7)
                    );

                    if (type === 'tEXt' || type === 'iTXt') {
                        const dataStart = offset + 8;
                        const textData = new Uint8Array(arrayBuffer, dataStart, length);
                        const text = new TextDecoder().decode(textData);
                        const [key, value] = text.split('\0');

                        if (key === 'parameters') {
                            metadata.parameters = parseParameters(value);
                        } else if (key === 'prompt') {
                            try {
                                const promptObj = JSON.parse(value);
                                const extracted = extractPromptFromComfyUI(promptObj);
                                if (extracted) {
                                    if (extracted.prompt) {
                                        metadata.prompt = extracted.prompt;
                                    }
                                    if (extracted.negativePrompt) {
                                        metadata.negativePrompt = extracted.negativePrompt;
                                    }
                                }
                            } catch (e) {
                                metadata.prompt = value;
                            }
                        } else if (key === 'workflow') {
                            metadata[key] = value;
                        }
                    }

                    offset += 12 + length;
                    if (type === 'IEND') break;
                }

                resolve(metadata);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Error reading file'));
        reader.readAsArrayBuffer(file);
    });
}

function extractJPEGMetadata(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const arrayBuffer = e.target.result;
                const exifData = piexif.load(arrayBuffer);
                const metadata = { parameters: [] };

                if (exifData.Exif && exifData.Exif[piexif.ExifIFD.UserComment]) {
                    const userComment = exifData.Exif[piexif.ExifIFD.UserComment];
                    const commentStr = userComment ?
                        (typeof userComment === 'string' ? userComment : new TextDecoder('utf-8').decode(userComment)) :
                        '';

                    if (commentStr) {
                        metadata.parameters = parseParameters(commentStr);
                    }
                }

                if (exifData.XMP) {
                    try {
                        const xmpStr = exifData.XMP;
                        if (xmpStr.includes('<dc:description>')) {
                            const descStart = xmpStr.indexOf('<dc:description>') + 16;
                            const descEnd = xmpStr.indexOf('</dc:description>');
                            const description = xmpStr.substring(descStart, descEnd);
                            if (description) {
                                metadata.prompt = description;
                            }
                        }
                    } catch (xmpError) {
                        console.warn('Error parsing XMP data:', xmpError);
                    }
                }

                resolve(metadata);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Error reading file'));
        reader.readAsArrayBuffer(file);
    });
}

function parseParameters(parameters) {
    const result = [];
    let current = '';
    let inNegative = false;

    const lines = parameters.split('\n');

    for (const line of lines) {
        if (line.startsWith(negativePrefix)) {
            result.push(line);
            inNegative = true;
        } else if (line.startsWith(paramsPrefix)) {
            result.push(line);
        } else if (inNegative) {
            result[result.length - 1] += '\n' + line;
        } else if (result.length > 0 && !result[result.length - 1].startsWith(paramsPrefix)) {
            result[result.length - 1] += '\n' + line;
        } else {
            result.push(line);
        }
    }

    return result;
}

function extractPromptFromComfyUI(promptObj) {
    if (!promptObj || typeof promptObj !== 'object') {
        return null;
    }

    let promptText = '';
    let negativePromptText = '';
    let promptNodeId = null;
    let negativePromptNodeId = null;

    for (const [nodeId, node] of Object.entries(promptObj)) {
        if (!node || typeof node !== 'object') continue;

        const classType = node.class_type;
        if (classType !== 'CLIPTextEncode' && classType !== 'CLIPTextEncodeSDXL') continue;

        const inputs = node.inputs || {};
        const textValue = inputs.text;

        if (!textValue || typeof textValue !== 'string') continue;

        const lowerId = nodeId.toLowerCase();

        if (inputs.conditioning !== undefined || lowerId.includes('neg') || lowerId.includes('negative')) {
            if (!negativePromptNodeId) {
                negativePromptText = textValue;
                negativePromptNodeId = nodeId;
            }
        } else if (!promptNodeId) {
            promptText = textValue;
            promptNodeId = nodeId;
        }
    }

    if (!promptText && !negativePromptText) {
        promptText = tryResolveInputs(promptObj, promptNodeId);
        negativePromptText = tryResolveInputs(promptObj, negativePromptNodeId);
    }

    return {
        prompt: promptText || null,
        negativePrompt: negativePromptText || null
    };
}

function tryResolveInputs(promptObj, nodeId) {
    if (!nodeId || !promptObj[nodeId]) return null;

    const node = promptObj[nodeId];
    const inputs = node.inputs || {};

    if (inputs.text && typeof inputs.text === 'string') {
        return inputs.text;
    }

    if (Array.isArray(inputs.text)) {
        const lastItem = inputs.text[inputs.text.length - 1];
        if (typeof lastItem === 'string') {
            return lastItem;
        }
    }

    return null;
}

function displayMetadata(metadata) {
    resultsDiv.classList.remove('hidden');
    promptPre.textContent = '';
    negativePromptPre.textContent = '';
    parametersTable.innerHTML = '';

    if (metadata.parameters) {
        metadata.parameters.forEach(param => {
            if (param.startsWith(negativePrefix)) {
                negativePromptPre.textContent = param.substring(negativePrefix.length);
            } else if (param.startsWith(paramsPrefix)) {
                displayParametersTable(param);
            } else {
                promptPre.textContent += (promptPre.textContent ? '\n' : '') + param;
            }
        });
    }

    if (metadata.prompt) {
        promptPre.textContent = metadata.prompt;
    }

    if (metadata.negativePrompt) {
        negativePromptPre.textContent = metadata.negativePrompt;
    }
}

function displayParametersTable(parameters) {
    const params = {};
    const parts = parameters.split(', ');

    parts.forEach(part => {
        const separatorIndex = part.indexOf(': ');
        if (separatorIndex > -1) {
            const key = part.substring(0, separatorIndex);
            const value = part.substring(separatorIndex + 2);
            params[key] = value;
        }
    });

    parametersTable.innerHTML = '';

    const commonParams = ['Steps', 'Sampler', 'CFG scale', 'Seed', 'Size', 'Model', 'Model hash'];

    commonParams.forEach(key => {
        if (params[key]) {
            addParameterRow(key, params[key]);
            delete params[key];
        }
    });

    Object.keys(params).forEach(key => {
        addParameterRow(key, params[key]);
    });
}

function addParameterRow(name, value) {
    const row = document.createElement('div');
    row.className = 'param-row';

    const nameCell = document.createElement('span');
    nameCell.className = 'param-name';
    nameCell.textContent = name + ':';

    const valueCell = document.createElement('span');
    valueCell.className = 'param-value';
    valueCell.textContent = value;

    row.appendChild(nameCell);
    row.appendChild(valueCell);
    parametersTable.appendChild(row);
}

function populateEditFields(metadata) {
    editPrompt.value = '';
    editNegativePrompt.value = '';
    editParameters.innerHTML = '';

    if (metadata.parameters) {
        metadata.parameters.forEach(param => {
            if (param.startsWith(negativePrefix)) {
                editNegativePrompt.value = param.substring(negativePrefix.length);
            } else if (param.startsWith(paramsPrefix)) {
                createParameterEditors(param);
            } else {
                editPrompt.value += (editPrompt.value ? '\n' : '') + param;
            }
        });
    }

    if (metadata.prompt) {
        editPrompt.value = metadata.prompt;
    }
}

function createParameterEditors(parameters) {
    const params = parameters.split(', ');
    params.forEach(param => {
        const separatorIndex = param.indexOf(': ');
        if (separatorIndex > -1) {
            const key = param.substring(0, separatorIndex);
            const value = param.substring(separatorIndex + 2);

            const row = document.createElement('div');
            row.className = 'param-row';

            const nameCell = document.createElement('div');
            nameCell.className = 'param-name';
            nameCell.textContent = key + ':';

            const input = document.createElement('input');
            input.type = 'text';
            input.value = value;
            input.dataset.key = key;

            row.appendChild(nameCell);
            row.appendChild(input);
            editParameters.appendChild(row);
        }
    });
}

function normalizeLoraMetadata(metadata) {
    return {
        ss_output_name: metadata.ss_output_name || metadata.output_name,
        ss_sd_model_name: metadata.ss_sd_model_name || metadata.sd_model_name,
        ss_vae_name: metadata.ss_vae_name || metadata.vae_name,
        ss_total_batch_size: metadata.ss_total_batch_size || metadata.batch_size,
        ss_resolution: metadata.ss_resolution || metadata.resolution,
        ss_clip_skip: metadata.ss_clip_skip || metadata.clip_skip || '1',
        ss_epoch: metadata.ss_epoch || metadata.epoch,
        ss_num_epochs: metadata.ss_num_epochs || metadata.num_epochs,
        ss_steps: metadata.ss_steps || metadata.steps,
        ss_max_train_steps: metadata.ss_max_train_steps || metadata.max_train_steps,
        ss_optimizer: metadata.ss_optimizer || metadata.optimizer,
        ss_lr_scheduler: metadata.ss_lr_scheduler || metadata.lr_scheduler,
        ss_learning_rate: metadata.ss_learning_rate || metadata.learning_rate,
        ss_text_encoder_lr: metadata.ss_text_encoder_lr || metadata.text_encoder_lr,
        ss_unet_lr: metadata.ss_unet_lr || metadata.unet_lr,
        ss_network_args: metadata.ss_network_args || metadata.network_args,
        ss_training_started_at: metadata.ss_training_started_at || metadata.training_started_at,
        ss_training_finished_at: metadata.ss_training_finished_at || metadata.training_finished_at,
        ss_dataset_dirs: metadata.ss_dataset_dirs || metadata.dataset_dirs,
        ss_training_comment: metadata.ss_training_comment || metadata.training_comment,
        ss_tag_frequency: metadata.ss_tag_frequency || metadata.tag_frequency
    };
}

function displayLoraMetadata(metadata) {
    try {
        document.getElementById('model-name').textContent = metadata.ss_output_name || '—';
        document.getElementById('model-vae').textContent = metadata.ss_vae_name || '—';

        const baseModelElem = document.getElementById('base-model');
        if (metadata.ss_sd_model_name) {
            if (metadata.ss_sd_model_name.includes('/')) {
                baseModelElem.innerHTML = `<a href="https://huggingface.co/${metadata.ss_sd_model_name}" target="_blank">${metadata.ss_sd_model_name}</a>`;
            } else {
                baseModelElem.textContent = metadata.ss_sd_model_name;
            }
        } else {
            baseModelElem.textContent = '—';
        }

        const batchSize = metadata.ss_total_batch_size ||
                         (metadata.ss_datasets?.[0]?.batch_size_per_device) ||
                         '—';
        document.getElementById('batch-size').textContent = batchSize;

        const resolution = metadata.ss_resolution ||
                          (metadata.ss_datasets?.[0]?.resolution);
        document.getElementById('resolution').textContent =
            resolution ? (Array.isArray(resolution) ? resolution.join('x') : resolution) : '—';

        document.getElementById('clip-skip').textContent = metadata.ss_clip_skip || '1';
        document.getElementById('epoch').textContent =
            `${metadata.ss_epoch || '—'} of ${metadata.ss_num_epochs || '—'}`;
        document.getElementById('steps').textContent =
            `${metadata.ss_steps || '—'} of ${metadata.ss_max_train_steps || '—'}`;

        document.getElementById('optimizer-type').textContent =
            extractOptimizerName(metadata.ss_optimizer) || '—';
        document.getElementById('scheduler').textContent = metadata.ss_lr_scheduler || '—';

        const learningRates = [
            `LR: ${metadata.ss_learning_rate || '—'}`,
            `TE: ${metadata.ss_text_encoder_lr || '—'}`,
            `UNET: ${metadata.ss_unet_lr || '—'}`
        ].join('\n');
        document.getElementById('learning-rates').textContent = learningRates;

        const optionalArgs = metadata.ss_network_args || extractOptimizerArgs(metadata.ss_optimizer);
        document.getElementById('optional-args').textContent =
            optionalArgs ? JSON.stringify(optionalArgs, null, 2) : '—';

        const startDate = metadata.ss_training_started_at ?
            new Date(metadata.ss_training_started_at * 1000).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }) : '—';
        document.getElementById('train-date').textContent = startDate;

        let trainTime = '—';
        if (metadata.ss_training_started_at && metadata.ss_training_finished_at) {
            const duration = metadata.ss_training_finished_at - metadata.ss_training_started_at;
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const seconds = (duration % 60).toFixed(1);
            trainTime = `${hours}h ${minutes}m ${seconds}s`;
        }
        document.getElementById('train-time').textContent = trainTime;

        const datasetInfoElem = document.getElementById('dataset-info');
        try {
            const datasetInfo = metadata.ss_dataset_dirs ?
                (typeof metadata.ss_dataset_dirs === 'string' ?
                    JSON.parse(metadata.ss_dataset_dirs) :
                    metadata.ss_dataset_dirs) :
                null;

            if (datasetInfo && Object.keys(datasetInfo).length > 0) {
                datasetInfoElem.textContent = JSON.stringify(datasetInfo, null, 2);
            } else {
                datasetInfoElem.textContent = '—';
            }
        } catch (e) {
            datasetInfoElem.textContent = metadata.ss_dataset_dirs || '—';
        }

        document.getElementById('suggested-prompt').textContent = metadata.ss_training_comment || '—';

        const tagFrequencyElem = document.getElementById('tag-frequency');
        try {
            const tagData = metadata.ss_tag_frequency ?
                (typeof metadata.ss_tag_frequency === 'string' ?
                    JSON.parse(metadata.ss_tag_frequency) :
                    metadata.ss_tag_frequency) :
                {};

            if (Object.keys(tagData).length > 0) {
                tagFrequencyElem.textContent = JSON.stringify(tagData, null, 2);
            } else {
                tagFrequencyElem.textContent = '—';
            }
        } catch (e) {
            tagFrequencyElem.textContent = metadata.ss_tag_frequency || '—';
        }
    } catch (error) {
        console.error('Error displaying metadata:', error);
        showLoraNotification('Error displaying metadata', 'error');
    }
}

function extractOptimizerName(optimizerString) {
    if (!optimizerString) return null;
    const match = optimizerString.match(/^([^(]+)/);
    return match ? match[0].replace('opt.', '').trim() : optimizerString;
}

function extractOptimizerArgs(optimizerString) {
    if (!optimizerString) return null;
    const argsMatch = optimizerString.match(/\(([^)]+)\)/);
    if (!argsMatch) return null;

    const args = {};
    argsMatch[1].split(',').forEach(arg => {
        const [key, value] = arg.split('=').map(s => s.trim());
        if (key && value) args[key] = value;
    });
    return args;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy text: ', err);
    });
}

function showNotification(message, type) {
    notification.textContent = message;
    notification.className = 'notification ' + (type || '');
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function showEditNotification(message, type) {
    editNotification.textContent = message;
    editNotification.className = 'notification ' + (type || '');
    editNotification.classList.add('show');

    setTimeout(() => {
        editNotification.classList.remove('show');
    }, 3000);
}

function showLoraNotification(message, type) {
    loraNotification.textContent = message;
    loraNotification.className = 'notification ' + (type || '');
    loraNotification.classList.add('show');

    setTimeout(() => {
        loraNotification.classList.remove('show');
    }, 3000);
}

const civitaiTab = document.getElementById('civitai-tab');
const civitaiNotification = document.getElementById('civitai-notification');
const civitaiResults = document.getElementById('civitai-results');
const civitaiHashInput = document.getElementById('civitai-hash-input');
const civitaiHashBtn = document.getElementById('civitai-hash-btn');
const civitaiNameInput = document.getElementById('civitai-name-input');
const civitaiTypeSelect = document.getElementById('civitai-type-select');
const civitaiNameBtn = document.getElementById('civitai-name-btn');
const hashSearchWrapper = document.getElementById('hash-search');
const nameSearchWrapper = document.getElementById('name-search');

function setupCivitaiSearch() {
    document.querySelectorAll('.search-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            const searchType = this.getAttribute('data-search');
            if (searchType === 'hash') {
                hashSearchWrapper.classList.remove('hidden');
                nameSearchWrapper.classList.add('hidden');
            } else {
                hashSearchWrapper.classList.add('hidden');
                nameSearchWrapper.classList.remove('hidden');
            }
        });
    });

    civitaiHashBtn.addEventListener('click', handleCivitaiHashSearch);
    civitaiNameBtn.addEventListener('click', handleCivitaiNameSearch);

    civitaiHashInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleCivitaiHashSearch();
    });

    civitaiNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleCivitaiNameSearch();
    });
}

async function handleCivitaiHashSearch() {
    const hash = civitaiHashInput.value.trim();
    if (!hash) {
        showCivitaiNotification('Please enter a hash', 'error');
        return;
    }

    civitaiHashBtn.disabled = true;
    civitaiHashBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Searching...</span>';

    try {
        const metadata = await CivitaiClient.loadCivitaiInfoByHash(hash, civitaiResults);
        if (metadata) {
            civitaiResults.classList.remove('hidden');
            showCivitaiNotification('Model found!', 'success');
        } else {
            showCivitaiNotification('No model found for this hash', 'error');
            civitaiResults.classList.add('hidden');
        }
    } catch (error) {
        console.error('Civitai search error:', error);
        showCivitaiNotification('Error searching Civitai: ' + error.message, 'error');
        civitaiResults.classList.add('hidden');
    }

    civitaiHashBtn.disabled = false;
    civitaiHashBtn.innerHTML = '<i class="fas fa-search"></i><span>Search</span>';
}

async function handleCivitaiNameSearch() {
    const name = civitaiNameInput.value.trim();
    if (!name) {
        showCivitaiNotification('Please enter a model name', 'error');
        return;
    }

    const type = civitaiTypeSelect.value;

    civitaiNameBtn.disabled = true;
    civitaiNameBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Searching...</span>';

    try {
        const metadata = await CivitaiClient.loadCivitaiInfoByName(name, civitaiResults, type || null);
        if (metadata) {
            civitaiResults.classList.remove('hidden');
            showCivitaiNotification('Model found!', 'success');
        } else {
            showCivitaiNotification('No models found', 'error');
            civitaiResults.classList.add('hidden');
        }
    } catch (error) {
        console.error('Civitai search error:', error);
        showCivitaiNotification('Error searching Civitai: ' + error.message, 'error');
        civitaiResults.classList.add('hidden');
    }

    civitaiNameBtn.disabled = false;
    civitaiNameBtn.innerHTML = '<i class="fas fa-search"></i><span>Search</span>';
}

function showCivitaiNotification(message, type) {
    civitaiNotification.textContent = message;
    civitaiNotification.className = 'notification ' + (type || '');
    civitaiNotification.classList.add('show');

    setTimeout(() => {
        civitaiNotification.classList.remove('show');
    }, 3000);
}

function init() {
    setupTabSwitching();
    setupDragAndDrop();
    setupEditDragAndDrop();
    setupLoraDragAndDrop();
    setupCivitaiSearch();
    setupCopyButtons();
    setupFileInputs();
    setupSaveHandler();
}

document.addEventListener('DOMContentLoaded', init);
