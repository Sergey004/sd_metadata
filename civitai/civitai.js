const CIVITAI_API_BASE = "https://civitai.com/api/v1";

const CIVITAI_TYPES = {
    "Checkpoint": "checkpoints",
    "LORA": "loras",
    "LoCon": "loras",
    "TextualInversion": "embeddings",
    "VAE": "vae",
    "Upscaler": "upscale_models"
};

function getCivitaiApiHeaders() {
    return {
        "User-Agent": "MetadataEditor/1.0",
        "Content-Type": "application/json"
    };
}

async function civitaiFetch(endpoint, options = {}) {
    const url = `${CIVITAI_API_BASE}${endpoint}`;
    const headers = {
        ...getCivitaiApiHeaders(),
        ...options.headers
    };

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error("Civitai API error:", error);
        throw error;
    }
}

async function getModelVersionByHash(hash) {
    if (!hash || hash.length < 8) {
        return null;
    }

    const cleanHash = hash.toLowerCase().trim();

    try {
        const data = await civitaiFetch("/model-versions/by-hash", {
            method: "POST",
            body: JSON.stringify([cleanHash])
        });

        return data;
    } catch (error) {
        console.warn("Failed to fetch model by hash:", error);
        return null;
    }
}

async function searchModels(query, options = {}) {
    const { page = 1, pageSize = 10, types = null } = options;

    const params = new URLSearchParams({
        query: query,
        page: page.toString(),
        pageSize: pageSize.toString()
    });

    if (types) {
        params.append("types", types);
    }

    try {
        const data = await civitaiFetch(`/models?${params.toString()}`);
        return data;
    } catch (error) {
        console.warn("Failed to search models:", error);
        return null;
    }
}

async function getModelById(modelId) {
    try {
        const data = await civitaiFetch(`/models/${modelId}`);
        return data;
    } catch (error) {
        console.warn("Failed to fetch model:", error);
        return null;
    }
}

async function getModelVersionById(modelVersionId) {
    try {
        const data = await civitaiFetch(`/model-versions/${modelVersionId}`);
        return data;
    } catch (error) {
        console.warn("Failed to fetch model version:", error);
        return null;
    }
}

function parseCivitaiMetadata(apiResponse) {
    if (!apiResponse) {
        return null;
    }

    const result = {
        modelId: null,
        modelVersionId: null,
        name: null,
        description: null,
        modelType: null,
        baseModel: null,
        baseModelType: null,
        trainedWords: [],
        versionName: null,
        versionDescription: null,
        suggestedPrompt: null,
        images: [],
        files: [],
        downloadUrl: null,
        sha256: null,
        nsfw: false,
        tags: []
    };

    if (apiResponse.model) {
        const model = apiResponse.model;
        result.modelId = model.id;
        result.name = model.name;
        result.modelType = model.type;
        result.description = stripHtml(model.description || "");
        result.tags = (model.tags || []).map(t => typeof t === 'string' ? t : t.name);
        result.nsfw = model.nsfw || false;
    }

    if (apiResponse.modelVersions && Array.isArray(apiResponse.modelVersions) && apiResponse.modelVersions.length > 0) {
        const version = apiResponse.modelVersions[0];
        result.modelVersionId = version.id;
        result.versionName = version.name;
        result.versionDescription = stripHtml(version.description || "");
        result.baseModel = version.baseModel;
        result.baseModelType = version.baseModelType;
        result.trainedWords = (version.trainedWords || []).map(String);
        result.suggestedPrompt = version.trainingDetails?.comments || version.suggestedPrompt || null;
        result.images = (version.images || []).map(img => ({
            url: img.url,
            nsfw: img.nsfw,
            width: img.width,
            height: img.height,
            hash: img.hash
        }));
        result.files = (version.files || []).map(f => ({
            name: f.name,
            size: f.sizeKB,
            type: f.type,
            downloadUrl: f.downloadUrl,
            hashes: f.hashes
        }));

        const primaryFile = result.files.find(f => f.type === "Model" || f.name.endsWith(".safetensors"));
        if (primaryFile) {
            result.downloadUrl = primaryFile.downloadUrl;
            result.sha256 = primaryFile.hashes?.SHA256 || null;
        }
    } else if (apiResponse.files) {
        result.files = (apiResponse.files || []).map(f => ({
            name: f.name,
            size: f.sizeKB,
            type: f.type,
            downloadUrl: f.downloadUrl,
            hashes: f.hashes
        }));

        const primaryFile = result.files.find(f => f.type === "Model" || f.name.endsWith(".safetensors"));
        if (primaryFile) {
            result.downloadUrl = primaryFile.downloadUrl;
            result.sha256 = primaryFile.hashes?.SHA256 || null;
        }
    }

    if (!result.baseModel && apiResponse.baseModel) {
        result.baseModel = apiResponse.baseModel;
    }

    result.sdVersion = detectSdVersion(result.baseModel);

    return result;
}

function detectSdVersion(baseModel) {
    if (!baseModel) return "Other";

    const bm = baseModel.toUpperCase();
    if (bm.includes("SDXL")) return "SDXL";
    if (bm.includes("SD 2")) return "SD 2";
    if (bm.includes("SD 1.5")) return "SD 1.5";
    if (bm.includes("ILLUSTRIOUS")) return "Illustrious";
    if (bm.includes("PONY")) return "Pony";
    if (bm.includes("NOOBAI")) return "Noob AI";
    return "Other";
}

function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function formatFileSize(kb) {
    if (!kb) return "Unknown";
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(2)} MB`;
    return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
}

function createCopyButton(text, container) {
    const btn = document.createElement("button");
    btn.className = "btn-copy";
    btn.innerHTML = '<i class="fas fa-copy"></i><span>Copy</span>';
    btn.addEventListener("click", () => {
        copyToClipboard(text);
        btn.classList.add("copied");
        btn.querySelector("span").textContent = "Copied!";
        setTimeout(() => {
            btn.classList.remove("copied");
            btn.querySelector("span").textContent = "Copy";
        }, 2000);
    });
    return btn;
}

function displayCivitaiMetadata(metadata, container) {
    if (!metadata || !container) return;

    container.innerHTML = "";

    if (!metadata.name) {
        container.innerHTML = '<p style="color: var(--text-muted);">No model information found</p>';
        return;
    }

    const header = document.createElement("div");
    header.className = "meta-card full-width";
    header.innerHTML = `
        <div class="meta-header">
            <h3>Civitai Info</h3>
            ${metadata.modelId ? `<a href="https://civitai.com/models/${metadata.modelId}" target="_blank" class="btn-copy" style="text-decoration: none;">
                <i class="fas fa-external-link-alt"></i><span>Open in Civitai</span>
            </a>` : ""}
        </div>
        <div class="meta-content">
            <div class="param-row">
                <span class="param-name">Name:</span>
                <span class="param-value">${escapeHtml(metadata.name || "Unknown")}</span>
            </div>
            <div class="param-row">
                <span class="param-name">Type:</span>
                <span class="param-value">${escapeHtml(metadata.modelType || "Unknown")}</span>
            </div>
            <div class="param-row">
                <span class="param-name">Base Model:</span>
                <span class="param-value">${escapeHtml(metadata.baseModel || "Unknown")}</span>
            </div>
            <div class="param-row">
                <span class="param-name">Version:</span>
                <span class="param-value">${escapeHtml(metadata.versionName || "Unknown")}</span>
            </div>
        </div>
    `;
    container.appendChild(header);

    if (metadata.trainedWords && metadata.trainedWords.length > 0) {
        const trainedCard = document.createElement("div");
        trainedCard.className = "meta-card full-width";
        const trainedText = metadata.trainedWords.join(", ");
        trainedCard.innerHTML = `
            <div class="meta-header">
                <h3>Trigger Words</h3>
            </div>
            <div class="meta-content">
                <pre>${escapeHtml(trainedText)}</pre>
            </div>
        `;
        trainedCard.querySelector(".meta-header").appendChild(createCopyButton(trainedText, trainedCard));
        container.appendChild(trainedCard);
    }

    if (metadata.description) {
        const descCard = document.createElement("div");
        descCard.className = "meta-card full-width";
        const descText = metadata.description;
        descCard.innerHTML = `
            <div class="meta-header">
                <h3>Description</h3>
            </div>
            <div class="meta-content">
                <pre>${escapeHtml(descText)}</pre>
            </div>
        `;
        descCard.querySelector(".meta-header").appendChild(createCopyButton(descText, descCard));
        container.appendChild(descCard);
    }

    if (metadata.suggestedPrompt) {
        const promptCard = document.createElement("div");
        promptCard.className = "meta-card full-width";
        const promptText = metadata.suggestedPrompt;
        promptCard.innerHTML = `
            <div class="meta-header">
                <h3>Suggested Prompt</h3>
            </div>
            <div class="meta-content">
                <pre>${escapeHtml(promptText)}</pre>
            </div>
        `;
        promptCard.querySelector(".meta-header").appendChild(createCopyButton(promptText, promptCard));
        container.appendChild(promptCard);
    }

    if (metadata.images && metadata.images.length > 0) {
        const imageCard = document.createElement("div");
        imageCard.className = "meta-card";
        const previewImage = metadata.images.find(img => !img.nsfw) || metadata.images[0];
        imageCard.innerHTML = `
            <div class="meta-header">
                <h3>Preview</h3>
                <a href="${escapeHtml(previewImage.url)}" target="_blank" class="btn-copy" style="text-decoration: none;">
                    <i class="fas fa-external-link-alt"></i><span>Original</span>
                </a>
            </div>
            <div class="meta-content" style="text-align: center;">
                <img src="${escapeHtml(previewImage.url)}" alt="Preview" style="max-width: 100%; max-height: 300px; border-radius: 8px;">
            </div>
        `;
        container.appendChild(imageCard);
    }

    if (metadata.files && metadata.files.length > 0) {
        const filesCard = document.createElement("div");
        filesCard.className = "meta-card";
        filesCard.innerHTML = `
            <div class="meta-header">
                <h3>Files</h3>
            </div>
            <div class="meta-content">
                ${metadata.files.map(f => `
                    <div class="param-row">
                        <span class="param-name">${escapeHtml(f.name)}</span>
                        <span class="param-value">${formatFileSize(f.size)}</span>
                    </div>
                `).join("")}
            </div>
        `;
        container.appendChild(filesCard);
    }
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

async function loadCivitaiInfoByHash(hash, container) {
    const apiResponse = await getModelVersionByHash(hash);
    if (!apiResponse) {
        return null;
    }

    const metadata = parseCivitaiMetadata(apiResponse);
    if (metadata) {
        displayCivitaiMetadata(metadata, container);
    }
    return metadata;
}

async function loadCivitaiInfoByName(name, container, types = null) {
    const searchResult = await searchModels(name, { types, pageSize: 5 });
    if (!searchResult || !searchResult.items || searchResult.items.length === 0) {
        return null;
    }

    let bestMatch = null;
    for (const item of searchResult.items) {
        if (item.modelVersions && item.modelVersions.length > 0) {
            const mv = item.modelVersions[0];
            if (mv.files) {
                for (const file of mv.files) {
                    const fileName = file.name.replace(/\.(safetensors|ckpt|pt|bin)$/i, "").toLowerCase().trim();
                    const searchName = name.toLowerCase().trim();
                    if (fileName === searchName || fileName.includes(searchName) || searchName.includes(fileName)) {
                        bestMatch = {
                            ...item,
                            modelVersions: [mv]
                        };
                        break;
                    }
                }
            }
        }
        if (bestMatch) break;
    }

    if (!bestMatch && searchResult.items.length > 0) {
        bestMatch = searchResult.items[0];
    }

    if (!bestMatch) {
        return null;
    }

    const metadata = parseCivitaiMetadata(bestMatch);
    if (metadata) {
        displayCivitaiMetadata(metadata, container);
    }
    return metadata;
}

window.CivitaiClient = {
    getModelVersionByHash,
    searchModels,
    getModelById,
    getModelVersionById,
    parseCivitaiMetadata,
    displayCivitaiMetadata,
    loadCivitaiInfoByHash,
    loadCivitaiInfoByName
};
