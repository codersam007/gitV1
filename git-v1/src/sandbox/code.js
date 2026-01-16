/**
 * ============================================
 * DESIGN BRANCH MANAGER - SANDBOX MAIN ENTRY
 * ============================================
 * 
 * This is the main entry point for the document sandbox runtime.
 * It initializes all modules and exposes the API to the UI runtime.
 * 
 * NOTE: All modules are combined in this file because Adobe Express
 * add-ons don't support ES6 module imports for local files.
 * The code is organized into clear sections to maintain modularity.
 * 
 * The sandbox runs in a separate context from the UI and has direct
 * access to the Adobe Express document through the SDK.
 */

import addOnSandboxSdk from "add-on-sdk-document-sandbox";
import { editor } from "express-document-sdk";

// Get the document sandbox runtime
const { runtime } = addOnSandboxSdk.instance;

// ============================================
// MODULE: BRANCH MANAGER
// ============================================
// Manages branch state and switching logic

// Current branch state
let currentBranchId = null;
let currentBranchName = null;
let branchStateHash = null; // Hash of current branch state for change detection

// Pending images for async processing (module-level variable, not window)
let _pendingImages = null;

/**
 * Initialize branch manager
 */
function initializeBranch(branchId, branchName) {
    currentBranchId = branchId;
    currentBranchName = branchName;
    branchStateHash = null;
    console.log(`Branch manager initialized: ${branchName} (${branchId})`);
}

/**
 * Get current branch information
 */
function getCurrentBranch() {
    return {
        branchId: currentBranchId,
        branchName: currentBranchName,
        stateHash: branchStateHash
    };
}

/**
 * Set current branch
 */
function setCurrentBranch(branchId, branchName) {
    currentBranchId = branchId;
    currentBranchName = branchName;
    console.log(`Switched to branch: ${branchName} (${branchId})`);
}

/**
 * Update branch state hash
 */
function updateBranchStateHash(hash) {
    branchStateHash = hash;
}

/**
 * Check if branch has uncommitted changes
 */
function hasUncommittedChanges(currentStateHash) {
    if (!branchStateHash) {
        return false;
    }
    return currentStateHash !== branchStateHash;
}

/**
 * Reset branch state
 */
function resetBranchState() {
    branchStateHash = null;
}

// ============================================
// MODULE: STATE MANAGER
// ============================================
// Manages document state and change detection

/**
 * Generate a hash from document state
 */
function generateStateHash(documentState) {
    try {
        const stateString = JSON.stringify(documentState);
        let hash = 0;
        for (let i = 0; i < stateString.length; i++) {
            const char = stateString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    } catch (error) {
        console.error('Error generating state hash:', error);
        return Date.now().toString();
    }
}

/**
 * Get current document state hash
 */
async function getCurrentStateHash() {
    try {
        const documentState = await exportDocument();
        return generateStateHash(documentState);
    } catch (error) {
        console.error('Error getting current state hash:', error);
        return null;
    }
}

/**
 * Compare two document states
 */
function compareStates(state1, state2) {
    try {
        const hash1 = generateStateHash(state1);
        const hash2 = generateStateHash(state2);
        return hash1 === hash2;
    } catch (error) {
        console.error('Error comparing states:', error);
        return false;
    }
}

/**
 * Check if document has been modified since last save
 */
async function isDocumentModified(lastSavedHash) {
    try {
        if (!lastSavedHash) {
            return true;
        }
        const currentHash = await getCurrentStateHash();
        return currentHash !== lastSavedHash;
    } catch (error) {
        console.error('Error checking document modification:', error);
        return true;
    }
}

// ============================================
// MODULE: DOCUMENT MANAGER
// ============================================
// Handles exporting and importing Adobe Express document state

/**
 * Serialize a single element to JSON
 */
function serializeElement(element) {
    try {
        // Determine element type - normalize constructor names to our internal types
        let elementType = 'Unknown';
        const constructorName = element.constructor.name;
        
        // Map Adobe SDK constructor names to our internal types
        if (constructorName === 'RectangleNode' || constructorName === 'Rectangle') {
            elementType = 'Rectangle';
        } else if (constructorName === 'EllipseNode' || constructorName === 'Ellipse') {
            elementType = 'Ellipse';
        } else if (constructorName === 'StandaloneTextNode' || constructorName === 'Pe' || constructorName === 'TextNode' || constructorName === 'Text') {
            elementType = 'Text';
        } else if (constructorName === 'GroupNode' || constructorName === 'Group') {
            elementType = 'Group';
        } else if (constructorName === 'PathNode' || constructorName === 'Path') {
            elementType = 'Path';
        } else if (constructorName === 'MediaContainerNode' || constructorName === 'MediaContainer') {
            elementType = 'Image';
        } else if (constructorName === 'ComplexShapeNode' || constructorName === 'ComplexShape') {
            // ComplexShapeNode can be various things - check if it has image-like properties
            if (element.mediaRectangle || (element.children && element.children.length > 0)) {
                elementType = 'ComplexShape'; // Keep as ComplexShape for now
            } else {
                elementType = 'ComplexShape';
            }
        } else if (constructorName === 'ImageRectangleNode' || constructorName === 'ImageRectangle') {
            elementType = 'Image';
        } else {
            elementType = constructorName; // Fallback to actual name
        }
        
        const baseData = {
            id: element.id,
            type: elementType,
            translation: element.translation ? {
                x: element.translation.x,
                y: element.translation.y
            } : null,
            rotation: element.rotation || 0,
            opacity: element.opacity !== undefined ? element.opacity : 1
        };
        
        if (element.width !== undefined) {
            baseData.width = element.width;
        }
        if (element.height !== undefined) {
            baseData.height = element.height;
        }
        
        if (element.fill) {
            baseData.fill = serializeFill(element.fill);
        }
        
        if (element.stroke) {
            baseData.stroke = serializeStroke(element.stroke);
        }
        
        // Handle text-specific properties
        if (elementType === 'Text') {
            try {
                // Get text content
                if (element.fullContent && element.fullContent.text !== undefined) {
                    baseData.text = element.fullContent.text;
                } else if (element.text !== undefined) {
                    baseData.text = element.text;
                }
                
                // Get text alignment
                if (element.textAlignment !== undefined) {
                    baseData.textAlignment = element.textAlignment;
                }
                
                // Get text layout
                if (element.layout) {
                    baseData.textLayout = {
                        type: element.layout.type,
                        width: element.layout.width,
                        height: element.layout.height
                    };
                }
                
                // Get character styles (font, size, color, etc.)
                if (element.fullContent && element.fullContent.characterStyleRanges) {
                    try {
                        const styleRanges = element.fullContent.characterStyleRanges;
                        baseData.characterStyles = [];
                        
                        for (let i = 0; i < styleRanges.length; i++) {
                            const styleRange = styleRanges[i];
                            const styleData = {
                                length: styleRange.length,
                                fontSize: styleRange.fontSize,
                                color: styleRange.color ? {
                                    red: styleRange.color.red,
                                    green: styleRange.color.green,
                                    blue: styleRange.color.blue,
                                    alpha: styleRange.color.alpha !== undefined ? styleRange.color.alpha : 1
                                } : null,
                                letterSpacing: styleRange.letterSpacing,
                                underline: styleRange.underline,
                                baselineShift: styleRange.baselineShift
                            };
                            
                            // Get font information
                            if (styleRange.font) {
                                styleData.font = {
                                    postscriptName: styleRange.font.postscriptName,
                                    family: styleRange.font.family,
                                    style: styleRange.font.style
                                };
                            }
                            
                            baseData.characterStyles.push(styleData);
                        }
                    } catch (styleError) {
                        console.warn('Error reading character styles:', styleError);
                    }
                }
                
                // Get paragraph styles
                if (element.fullContent && element.fullContent.paragraphStyleRanges) {
                    try {
                        const paraRanges = element.fullContent.paragraphStyleRanges;
                        baseData.paragraphStyles = [];
                        
                        for (let i = 0; i < paraRanges.length; i++) {
                            const paraRange = paraRanges[i];
                            baseData.paragraphStyles.push({
                                length: paraRange.length,
                                spaceBefore: paraRange.spaceBefore,
                                spaceAfter: paraRange.spaceAfter,
                                lineSpacing: paraRange.lineSpacing
                            });
                        }
                    } catch (paraError) {
                        console.warn('Error reading paragraph styles:', paraError);
                    }
                }
            } catch (error) {
                console.warn('Error reading text properties:', error);
            }
        }
        
        // Handle rectangle corner radius
        if (elementType === 'Rectangle' && element.topLeftRadius !== undefined) {
            baseData.cornerRadius = {
                topLeft: element.topLeftRadius || 0,
                topRight: element.topRightRadius || 0,
                bottomRight: element.bottomRightRadius || 0,
                bottomLeft: element.bottomLeftRadius || 0
            };
            
            // Check if all corners are the same
            const uniformRadius = element.getUniformCornerRadius();
            if (uniformRadius !== undefined) {
                baseData.uniformCornerRadius = uniformRadius;
            }
        }
        
        // Handle image-specific properties (MediaContainerNode, ComplexShapeNode with images)
        if (elementType === 'Image' || elementType === 'ComplexShape') {
            try {
                // MediaContainerNode has mediaRectangle and maskShape
                if (element.mediaRectangle) {
                    const mediaRect = element.mediaRectangle;
                    
                    // Get image dimensions from media rectangle
                    if (mediaRect.width !== undefined) {
                        baseData.imageWidth = mediaRect.width;
                    }
                    if (mediaRect.height !== undefined) {
                        baseData.imageHeight = mediaRect.height;
                    }
                    
                    // Mark for async image data extraction
                    baseData.hasImageData = true;
                    baseData.imageId = element.id; // Use element ID as image identifier
                    
                    // If this was ComplexShape but has mediaRectangle, mark it as Image for import
                    if (elementType === 'ComplexShape') {
                        baseData.type = 'Image'; // Override type for proper import handling
                    }
                }
                
                // Get mask shape properties if present (for cropping)
                if (element.maskShape) {
                    try {
                        const mask = element.maskShape;
                        baseData.maskShape = {
                            translation: mask.translation ? {
                                x: mask.translation.x,
                                y: mask.translation.y
                            } : null,
                            rotation: mask.rotation || 0,
                            width: mask.width !== undefined ? mask.width : null,
                            height: mask.height !== undefined ? mask.height : null
                        };
                    } catch (maskError) {
                        console.warn('Error reading mask shape:', maskError);
                    }
                }
            } catch (imageError) {
                console.warn('Error reading image properties:', imageError);
            }
        }
        
        // Handle children (for groups)
        // Note: Adobe Express SDK uses .item(index) not .get(index)
        if (element.children && element.children.length > 0) {
            baseData.children = [];
            const childCount = element.children.length;
            for (let i = 0; i < childCount; i++) {
                const child = element.children.item(i);
                if (!child) continue;
                const childData = serializeElement(child);
                if (childData) {
                    baseData.children.push(childData);
                }
            }
        }
        
        return baseData;
    } catch (error) {
        console.warn('Error serializing element:', error);
        return null;
    }
}

/**
 * Convert Blob to base64 string
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} Base64 string
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        try {
            const reader = new FileReader();
            reader.onloadend = () => {
                try {
                    if (!reader.result) {
                        reject(new Error('FileReader result is null or undefined'));
                        return;
                    }
                    
                    // Handle data URL format: data:image/png;base64,<base64string>
                    const result = reader.result;
                    const commaIndex = result.indexOf(',');
                    
                    if (commaIndex === -1) {
                        reject(new Error('Invalid data URL format: no comma found'));
                        return;
                    }
                    
                    const base64String = result.substring(commaIndex + 1);
                    
                    // Validate base64 string
                    if (!base64String || base64String.length === 0) {
                        reject(new Error('Base64 string is empty'));
                        return;
                    }
                    
                    resolve(base64String);
                } catch (error) {
                    reject(new Error(`Error processing FileReader result: ${error.message}`));
                }
            };
            reader.onerror = (error) => {
                reject(new Error(`FileReader error: ${error.message || 'Unknown error'}`));
            };
            reader.readAsDataURL(blob);
        } catch (error) {
            reject(new Error(`Error creating FileReader: ${error.message}`));
        }
    });
}

/**
 * Convert base64 string to Blob
 * @param {string} base64 - Base64 string
 * @param {string} mimeType - MIME type (e.g., 'image/png')
 * @returns {Blob} Blob object
 */
function base64ToBlob(base64, mimeType = 'image/png') {
    try {
        // Validate input
        if (!base64 || typeof base64 !== 'string' || base64.length === 0) {
            throw new Error('Base64 string is empty or invalid');
        }
        
        // Clean base64 string (remove any whitespace or data URL prefix if present)
        const cleanBase64 = base64.trim();
        
        // Validate MIME type
        if (!mimeType || (mimeType !== 'image/png' && mimeType !== 'image/jpeg' && mimeType !== 'image/jpg')) {
            console.warn(`⚠️ Unsupported MIME type: ${mimeType}, defaulting to image/png`);
            mimeType = 'image/png';
        }
        
        // Decode base64
        let byteCharacters;
        try {
            byteCharacters = atob(cleanBase64);
        } catch (error) {
            throw new Error(`Failed to decode base64 string: ${error.message}`);
        }
        
        if (byteCharacters.length === 0) {
            throw new Error('Decoded base64 string is empty');
        }
        
        // Convert to byte array
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        
        // Create Blob
        const blob = new Blob([byteArray], { type: mimeType });
        
        // Validate blob
        if (blob.size === 0) {
            throw new Error('Created blob is empty');
        }
        
        return blob;
    } catch (error) {
        console.error('❌ Error in base64ToBlob:', error);
        throw error;
    }
}

/**
 * Serialize fill property
 */
function serializeFill(fill) {
    if (!fill) return null;
    
    const fillData = {
        type: fill.constructor.name || 'Unknown'
    };
    
    if (fill.color) {
        fillData.color = {
            red: fill.color.red,
            green: fill.color.green,
            blue: fill.color.blue,
            alpha: fill.color.alpha !== undefined ? fill.color.alpha : 1
        };
    }
    
    if (fill.gradient) {
        fillData.gradient = {
            type: fill.gradient.type,
            stops: fill.gradient.stops
        };
    }
    
    return fillData;
}

/**
 * Serialize stroke property
 */
function serializeStroke(stroke) {
    if (!stroke) return null;
    
    const strokeData = {
        type: stroke.type
    };
    
    if (stroke.width !== undefined) {
        strokeData.width = stroke.width;
    }
    
    if (stroke.color) {
        strokeData.color = {
            red: stroke.color.red,
            green: stroke.color.green,
            blue: stroke.color.blue,
            alpha: stroke.color.alpha !== undefined ? stroke.color.alpha : 1
        };
    }
    
    if (stroke.position !== undefined) {
        strokeData.position = stroke.position;
    }
    
    if (stroke.dashPattern && Array.isArray(stroke.dashPattern)) {
        strokeData.dashPattern = stroke.dashPattern;
    }
    
    if (stroke.dashOffset !== undefined) {
        strokeData.dashOffset = stroke.dashOffset;
    }
    
    return strokeData;
}

/**
 * Export the current document state to JSON
 */
async function exportDocument() {
    try {
        const document = editor.documentRoot;
        
        const documentState = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            pages: []
        };
        
        // Get pages from document root
        // Note: Adobe Express SDK uses .item(index) not .get(index)
        const pages = document.pages;
        if (!pages) {
            console.warn('No pages found in document');
            return documentState;
        }
        
        const pageCount = pages.length;
        if (pageCount === 0) {
            console.warn('Document has no pages');
            return documentState;
        }
        
        // Iterate through pages
        for (let i = 0; i < pageCount; i++) {
            const page = pages.item(i);
            if (!page) continue;
            
            const pageData = {
                id: page.id || `page_${i}`,
                name: page.name || `Page ${i + 1}`,
                width: page.width,
                height: page.height,
                artboards: []
            };
            
            // Get artboards from page
            // Note: Pages contain artboards, not direct children
            const artboards = page.artboards;
            if (artboards && artboards.length > 0) {
                const artboardCount = artboards.length;
                
                for (let a = 0; a < artboardCount; a++) {
                    const artboard = artboards.item(a);
                    if (!artboard) continue;
                    
                    const artboardData = {
                        id: artboard.id || `artboard_${a}`,
                        width: artboard.width,
                        height: artboard.height,
                        elements: []
                    };
                    
                    // Get children from artboard
                    const children = artboard.children;
                    if (children && children.length > 0) {
                        const childCount = children.length;
                        
                        // First pass: serialize all elements (including images, but without image data)
                        const elementDataList = [];
                        const imageElements = []; // Store image elements for async processing
                        
                        // Image types that need async data extraction
                        const imageTypesForExport = ['Image', 'MediaContainerNode', 'ComplexShape', 'ComplexShapeNode'];
                        
                        for (let j = 0; j < childCount; j++) {
                            const element = children.item(j);
                            if (!element) continue;
                            
                            const elementData = serializeElement(element);
                            if (elementData) {
                                // If it's an image type with image data marker, store for async extraction
                                const isImageType = imageTypesForExport.includes(elementData.type);
                                if ((isImageType && elementData.hasImageData) || element.mediaRectangle) {
                                    imageElements.push({ element, elementData });
                                }
                                elementDataList.push(elementData);
                            }
                        }
                        
                        // Second pass: Extract image data asynchronously
                        for (const { element, elementData } of imageElements) {
                            try {
                                // Get ImageRectangleNode from MediaContainerNode
                                if (element.mediaRectangle && typeof element.mediaRectangle.fetchBitmapImage === 'function') {
                                    const bitmapImage = await element.mediaRectangle.fetchBitmapImage();
                                    if (bitmapImage && bitmapImage.data) {
                                        // Convert Blob to base64
                                        const blob = await bitmapImage.data();
                                        
                                        // Validate blob - must have reasonable size (at least 100 bytes for any valid image)
                                        if (!blob || blob.size === 0) {
                                            console.warn(`⚠️ Image element ${element.id} - blob is empty or invalid`);
                                            elementData.imageData = null;
                                            continue;
                                        }
                                        
                                        // Minimum size check - valid images are at least a few hundred bytes
                                        if (blob.size < 100) {
                                            console.warn(`⚠️ Image element ${element.id} - blob too small (${blob.size} bytes), likely corrupted`);
                                            elementData.imageData = null;
                                            continue;
                                        }
                                        
                                        const base64 = await blobToBase64(blob);
                                        
                                        // Validate base64 string - must be substantial
                                        if (!base64 || base64.length === 0) {
                                            console.warn(`⚠️ Image element ${element.id} - base64 conversion failed`);
                                            elementData.imageData = null;
                                            continue;
                                        }
                                        
                                        // Validate base64 length matches blob size (roughly 4/3 ratio due to base64 encoding)
                                        const expectedMinLength = Math.floor(blob.size * 1.3);
                                        if (base64.length < expectedMinLength * 0.5) {
                                            console.warn(`⚠️ Image element ${element.id} - base64 length (${base64.length}) too small for blob size (${blob.size}), data may be corrupted`);
                                            elementData.imageData = null;
                                            continue;
                                        }
                                        
                                        // Validate bitmap dimensions are reasonable
                                        if (!bitmapImage.width || !bitmapImage.height || bitmapImage.width <= 0 || bitmapImage.height <= 0) {
                                            console.warn(`⚠️ Image element ${element.id} - invalid bitmap dimensions (${bitmapImage.width}x${bitmapImage.height})`);
                                            elementData.imageData = null;
                                            continue;
                                        }
                                        
                                        // Store image data in element
                                        // NOTE: Do NOT overwrite imageWidth/imageHeight - they were already set from mediaRect
                                        // in serializeElement() and represent the DISPLAYED size, not original bitmap size
                                        elementData.imageData = base64;
                                        elementData.imageMimeType = blob.type || 'image/png';
                                        
                                        // Store original bitmap dimensions separately for reference (but don't use for display size)
                                        elementData.originalImageWidth = bitmapImage.width;
                                        elementData.originalImageHeight = bitmapImage.height;
                                        
                                        console.log(`✅ Extracted image data for element ${element.id} (${blob.size} bytes, ${blob.type}, base64 length: ${base64.length})`);
                                        console.log(`   Display size: ${elementData.imageWidth}x${elementData.imageHeight}, Original: ${bitmapImage.width}x${bitmapImage.height}`);
                                    } else {
                                        console.warn(`⚠️ Image element ${element.id} - bitmapImage.data() returned null or undefined`);
                                        elementData.imageData = null;
                                    }
                                } else {
                                    console.warn(`⚠️ Image element ${element.id} does not support fetchBitmapImage (experimental API may not be available)`);
                                    elementData.imageData = null;
                                }
                            } catch (imageError) {
                                console.warn(`⚠️ Could not extract image data for element ${element.id}:`, imageError);
                                // Continue without image data - element will be skipped or show placeholder
                                elementData.imageData = null;
                            }
                        }
                        
                        artboardData.elements = elementDataList;
                    }
                    
                    pageData.artboards.push(artboardData);
                }
            }
            
            documentState.pages.push(pageData);
        }
        
        return documentState;
    } catch (error) {
        console.error('Error exporting document:', error);
        throw new Error(`Failed to export document: ${error.message}`);
    }
}

/**
 * Deserialize fill property
 */
function deserializeFill(fillData) {
    if (!fillData) return null;
    
    if (fillData.color) {
        return editor.makeColorFill({
            red: fillData.color.red,
            green: fillData.color.green,
            blue: fillData.color.blue,
            alpha: fillData.color.alpha !== undefined ? fillData.color.alpha : 1
        });
    }
    
    if (fillData.gradient) {
        console.warn('Gradient fill deserialization not yet implemented');
        return null;
    }
    
    return null;
}

/**
 * Deserialize stroke property
 */
function deserializeStroke(strokeData) {
    if (!strokeData) return null;
    
    try {
        // Create stroke using editor.makeStroke helper
        const strokeOptions = {};
        
        if (strokeData.color) {
            strokeOptions.color = {
                red: strokeData.color.red,
                green: strokeData.color.green,
                blue: strokeData.color.blue,
                alpha: strokeData.color.alpha !== undefined ? strokeData.color.alpha : 1
            };
        }
        
        if (strokeData.width !== undefined) {
            strokeOptions.width = strokeData.width;
        }
        
        if (strokeData.position !== undefined) {
            strokeOptions.position = strokeData.position;
        }
        
        if (strokeData.dashPattern && Array.isArray(strokeData.dashPattern)) {
            strokeOptions.dashPattern = strokeData.dashPattern;
        }
        
        if (strokeData.dashOffset !== undefined) {
            strokeOptions.dashOffset = strokeData.dashOffset;
        }
        
        return editor.makeStroke(strokeOptions);
    } catch (error) {
        console.warn('Error deserializing stroke:', error);
        return null;
    }
}

/**
 * Deserialize and add an element to the document
 */
function deserializeElement(elementData, parent) {
    try {
        let element;
        
        // Handle different element types - including legacy "Pe" type
        switch (elementData.type) {
            case 'Rectangle':
            case 'RectangleNode':
                element = editor.createRectangle();
                if (elementData.width !== undefined) element.width = elementData.width;
                if (elementData.height !== undefined) element.height = elementData.height;
                
                // Set corner radius
                if (elementData.cornerRadius) {
                    if (elementData.uniformCornerRadius !== undefined) {
                        // All corners are the same
                        element.setUniformCornerRadius(elementData.uniformCornerRadius);
                    } else {
                        // Individual corner radii
                        if (elementData.cornerRadius.topLeft !== undefined) {
                            element.topLeftRadius = elementData.cornerRadius.topLeft;
                        }
                        if (elementData.cornerRadius.topRight !== undefined) {
                            element.topRightRadius = elementData.cornerRadius.topRight;
                        }
                        if (elementData.cornerRadius.bottomRight !== undefined) {
                            element.bottomRightRadius = elementData.cornerRadius.bottomRight;
                        }
                        if (elementData.cornerRadius.bottomLeft !== undefined) {
                            element.bottomLeftRadius = elementData.cornerRadius.bottomLeft;
                        }
                    }
                }
                break;
                
            case 'Ellipse':
            case 'EllipseNode':
                element = editor.createEllipse();
                // Ellipses use rx/ry, but we might have width/height in JSON
                if (elementData.width !== undefined) element.rx = elementData.width / 2;
                if (elementData.height !== undefined) element.ry = elementData.height / 2;
                break;
                
            case 'Text':
            case 'TextNode':
            case 'StandaloneTextNode':
            case 'Pe':  // Legacy support for old exports
                // Create text element - pass initial text content if available
                const initialText = elementData.text || '';
                element = editor.createText(initialText);
                
                // Set text content using fullContent (correct way for Adobe SDK)
                if (elementData.text && element.fullContent) {
                    try {
                        element.fullContent.text = elementData.text;
                    } catch (error) {
                        console.warn('Could not set fullContent.text:', error);
                    }
                }
                
                // Set text alignment
                if (elementData.textAlignment !== undefined && element.textAlignment !== undefined) {
                    try {
                        element.textAlignment = elementData.textAlignment;
                    } catch (error) {
                        console.warn('Could not set textAlignment:', error);
                    }
                }
                
                // Set text layout
                if (elementData.textLayout && element.layout !== undefined) {
                    try {
                        if (elementData.textLayout.type === 2) { // autoHeight
                            element.layout = {
                                type: 2, // TextLayout.autoHeight
                                width: elementData.textLayout.width
                            };
                        } else if (elementData.textLayout.type === 1) { // area
                            element.layout = {
                                type: 1, // TextLayout.area
                                width: elementData.textLayout.width,
                                height: elementData.textLayout.height
                            };
                        }
                        // autoWidth (type 3) is default, no need to set
                    } catch (error) {
                        console.warn('Could not set text layout:', error);
                    }
                }
                
                // Restore character styles (font, size, color, etc.)
                if (elementData.characterStyles && element.fullContent) {
                    try {
                        const styleRanges = [];
                        for (const styleData of elementData.characterStyles) {
                            const styleInput = {
                                length: styleData.length
                            };
                            
                            if (styleData.fontSize !== undefined) {
                                styleInput.fontSize = styleData.fontSize;
                            }
                            
                            if (styleData.color) {
                                styleInput.color = {
                                    red: styleData.color.red,
                                    green: styleData.color.green,
                                    blue: styleData.color.blue,
                                    alpha: styleData.color.alpha !== undefined ? styleData.color.alpha : 1
                                };
                            }
                            
                            if (styleData.letterSpacing !== undefined) {
                                styleInput.letterSpacing = styleData.letterSpacing;
                            }
                            
                            if (styleData.underline !== undefined) {
                                styleInput.underline = styleData.underline;
                            }
                            
                            if (styleData.baselineShift !== undefined) {
                                styleInput.baselineShift = styleData.baselineShift;
                            }
                            
                            // Note: Font resolution is async (fonts.fromPostscriptName)
                            // For now, we'll apply styles without font and let Adobe use defaults
                            // Font restoration would require async handling which is complex
                            // The font family/style info is stored but not applied in this sync context
                            if (styleData.font && styleData.font.postscriptName) {
                                // Store font info for potential future async restoration
                                // For now, text will use default font but retain other styles
                                console.log('Font info available but async resolution skipped:', styleData.font.postscriptName);
                            }
                            
                            styleRanges.push(styleInput);
                        }
                        
                        // Apply character styles
                        if (styleRanges.length > 0) {
                            element.fullContent.characterStyleRanges = styleRanges;
                        }
                    } catch (styleError) {
                        console.warn('Error restoring character styles:', styleError);
                    }
                }
                
                // Restore paragraph styles
                if (elementData.paragraphStyles && element.fullContent) {
                    try {
                        const paraRanges = [];
                        for (const paraData of elementData.paragraphStyles) {
                            paraRanges.push({
                                length: paraData.length,
                                spaceBefore: paraData.spaceBefore,
                                spaceAfter: paraData.spaceAfter,
                                lineSpacing: paraData.lineSpacing
                            });
                        }
                        
                        if (paraRanges.length > 0) {
                            element.fullContent.paragraphStyleRanges = paraRanges;
                        }
                    } catch (paraError) {
                        console.warn('Error restoring paragraph styles:', paraError);
                    }
                }
                break;
                
            case 'Group':
            case 'GroupNode':
                element = editor.createGroup();
                break;
                
            case 'Path':
            case 'PathNode':
                // Paths need SVG path data - skip if not available
                if (elementData.path) {
                    try {
                        element = editor.createPath(elementData.path);
                    } catch (error) {
                        console.warn('Could not create path:', error);
                        return; // Skip this element
                    }
                } else {
                    console.warn('Path element missing path data, skipping');
                    return; // Skip this element
                }
                break;
                
            case 'Image':
            case 'MediaContainerNode':
            case 'ImageRectangleNode':
                // Images require async loading - we'll handle them separately in importDocument
                // Mark this element for async processing and return early
                elementData._needsAsyncImageLoad = true;
                return; // Skip for now, will handle in async step in importDocument
            
            case 'ComplexShape':
            case 'ComplexShapeNode':
                // ComplexShapeNode is used for complex shapes like images with effects, clipped shapes, etc.
                // If it has imageData, treat as image
                if (elementData.imageData || elementData.hasImageData) {
                    elementData._needsAsyncImageLoad = true;
                    return; // Handle as image in async step
                }
                // Otherwise, create a rectangle as placeholder (ComplexShape can't be created directly)
                console.warn(`ComplexShapeNode without image data, creating rectangle placeholder`);
                element = editor.createRectangle();
                break;
                
            default:
                console.warn(`Unknown element type: ${elementData.type}, creating rectangle as fallback`);
                element = editor.createRectangle();
        }
        
        // Set position
        if (elementData.translation) {
            element.translation = {
                x: elementData.translation.x,
                y: elementData.translation.y
            };
        }
        
        // Set rotation - rotation is read-only, must use setRotationInParent()
        // Note: This requires a rotation point, we'll use the element's center
        if (elementData.rotation !== undefined && elementData.rotation !== 0) {
            try {
                // Get the center point of the element for rotation
                const centerPoint = element.centerPointLocal;
                element.setRotationInParent(elementData.rotation, centerPoint);
            } catch (rotationError) {
                console.warn('Could not set rotation (may be read-only for this element type):', rotationError);
            }
        }
        
        // Set opacity
        if (elementData.opacity !== undefined) {
            element.opacity = elementData.opacity;
        }
        
        // Set fill
        if (elementData.fill) {
            element.fill = deserializeFill(elementData.fill);
        }
        
        // Set stroke
        if (elementData.stroke) {
            element.stroke = deserializeStroke(elementData.stroke);
        }
        
        // Add element to parent
        parent.children.append(element);
        
        // Handle children (for groups)
        // Note: Only GroupNode and similar container nodes have children
        if (elementData.children && elementData.children.length > 0 && element.children) {
            for (const childData of elementData.children) {
                deserializeElement(childData, element);
            }
        }
    } catch (error) {
        console.warn('Error deserializing element:', error, elementData);
    }
}

/**
 * Deserialize an image element (async)
 * @param {Object} elementData - Image element data from JSON
 * @param {ArtboardNode} parent - Parent artboard to add image to
 */
async function deserializeImage(elementData, parent) {
    try {
        console.log('🖼️ Deserializing image element:', elementData.id);
        
        if (!elementData.imageData) {
            console.warn('⚠️ Image element missing imageData, skipping');
            return;
        }
        
        // Validate base64 string
        if (typeof elementData.imageData !== 'string' || elementData.imageData.length === 0) {
            console.error('❌ Invalid base64 string in imageData');
            return;
        }
        
        // Validate base64 string has minimum length (small images are at least a few hundred chars)
        if (elementData.imageData.length < 100) {
            console.error(`❌ Base64 string too short (${elementData.imageData.length} chars), image data likely corrupted`);
            return;
        }
        
        // Convert base64 to Blob with validation
        const mimeType = elementData.imageMimeType || 'image/png';
        let blob;
        try {
            blob = base64ToBlob(elementData.imageData, mimeType);
            console.log(`✅ Created blob: ${blob.size} bytes, type: ${blob.type}`);
        } catch (blobError) {
            console.error(`❌ Failed to create blob from base64:`, blobError);
            return;
        }
        
        // Validate blob before loading - must have reasonable size
        if (!blob || blob.size === 0) {
            console.error('❌ Blob is empty or invalid');
            return;
        }
        
        if (blob.size < 100) {
            console.error(`❌ Blob too small (${blob.size} bytes), image data likely corrupted`);
            return;
        }
        
        // Load bitmap image (async) with error handling
        let bitmapImage;
        try {
            bitmapImage = await editor.loadBitmapImage(blob);
            if (!bitmapImage) {
                throw new Error('loadBitmapImage returned null or undefined');
            }
            
            // Validate loaded bitmap has valid dimensions
            if (!bitmapImage.width || !bitmapImage.height || bitmapImage.width <= 0 || bitmapImage.height <= 0) {
                throw new Error(`Invalid bitmap dimensions: ${bitmapImage.width}x${bitmapImage.height}`);
            }
            
            console.log(`✅ Loaded bitmap image: ${bitmapImage.width}x${bitmapImage.height}`);
        } catch (loadError) {
            console.error(`❌ Failed to load bitmap image:`, loadError);
            return;
        }
        
        // Create image container inside queueAsyncEdit
        await editor.queueAsyncEdit(() => {
            // Use the DISPLAYED dimensions (imageWidth/imageHeight) that were saved from mediaRect
            // These represent the actual size the image was displayed at, not the original bitmap size
            let targetWidth = elementData.imageWidth;
            let targetHeight = elementData.imageHeight;
            
            // Fallback to element width/height if imageWidth/imageHeight not set
            if (!targetWidth || !targetHeight) {
                targetWidth = elementData.width || bitmapImage.width;
                targetHeight = elementData.height || bitmapImage.height;
                console.warn(`⚠️ Using fallback dimensions: ${targetWidth}x${targetHeight}`);
            }
            
            // Validate dimensions
            if (!targetWidth || !targetHeight || targetWidth <= 0 || targetHeight <= 0) {
                console.warn(`⚠️ Invalid dimensions (${targetWidth}x${targetHeight}), using bitmap dimensions`);
                targetWidth = bitmapImage.width;
                targetHeight = bitmapImage.height;
            }
            
            // Determine initial size - must maintain aspect ratio of original image
            const originalAspectRatio = bitmapImage.width / bitmapImage.height;
            const savedAspectRatio = targetWidth / targetHeight;
            const aspectRatioDiff = Math.abs(savedAspectRatio - originalAspectRatio);
            
            // If aspect ratio doesn't match, scale the dimensions to match while preserving one dimension
            if (aspectRatioDiff > 0.01) {
                console.warn(`⚠️ Saved dimensions (${targetWidth}x${targetHeight}) don't match aspect ratio (${originalAspectRatio.toFixed(3)}), adjusting...`);
                // Scale to match aspect ratio while preserving the larger dimension
                if (targetWidth / targetHeight > originalAspectRatio) {
                    // Width is too large, adjust height
                    targetHeight = targetWidth / originalAspectRatio;
                } else {
                    // Height is too large, adjust width
                    targetWidth = targetHeight * originalAspectRatio;
                }
                console.log(`   Adjusted to: ${targetWidth.toFixed(2)}x${targetHeight.toFixed(2)}`);
            }
            
            const initialSize = {
                width: targetWidth,
                height: targetHeight
            };
            
            console.log(`📐 Creating image container with size: ${initialSize.width}x${initialSize.height} (original: ${bitmapImage.width}x${bitmapImage.height})`);
            
            // Create image container
            // Note: initialSize must have same aspect ratio as bitmapImage (SDK requirement)
            let mediaContainer;
            try {
                mediaContainer = editor.createImageContainer(bitmapImage, {
                    initialSize: initialSize
                });
                
                if (!mediaContainer) {
                    throw new Error('createImageContainer returned null or undefined');
                }
            } catch (createError) {
                console.error(`❌ Failed to create image container:`, createError);
                throw createError;
            }
            
            // Set position
            if (elementData.translation) {
                mediaContainer.translation = {
                    x: elementData.translation.x,
                    y: elementData.translation.y
                };
            }
            
            // Set rotation
            if (elementData.rotation !== undefined && elementData.rotation !== 0) {
                try {
                    const centerPoint = mediaContainer.centerPointLocal;
                    mediaContainer.setRotationInParent(elementData.rotation, centerPoint);
                } catch (rotationError) {
                    console.warn('Could not set image rotation:', rotationError);
                }
            }
            
            // Set opacity
            if (elementData.opacity !== undefined) {
                mediaContainer.opacity = elementData.opacity;
            }
            
            // Note: Mask shape restoration is complex and may not be fully supported
            // The mask shape is read-only in some cases
            
            // Add to artboard
            parent.children.append(mediaContainer);
            
            console.log(`✅ Image element created and added to artboard at (${mediaContainer.translation.x}, ${mediaContainer.translation.y})`);
        });
        
    } catch (error) {
        console.error('❌ Error deserializing image:', error);
        // Don't throw - allow other images to continue loading
        console.error('   Full error details:', error.stack || error);
    }
}

/**
 * Import document from JSON state
 * NOTE: All document modifications must be wrapped in editor.queueAsyncEdit()
 * because this function is called after async operations (API calls)
 * 
 * PHASE 1: Minimal working version - reads from JSON and creates elements
 */
async function importDocument(documentState) {
    try {
        console.log('📥 Importing document from JSON...');
        console.log('📄 Document state received:', JSON.stringify(documentState, null, 2));
        
        // Validate document state
        if (!documentState) {
            throw new Error('Document state is null or undefined');
        }
        
        if (!documentState.pages || !Array.isArray(documentState.pages) || documentState.pages.length === 0) {
            console.warn('⚠️ No pages in document state, creating empty document');
            await clearDocument();
            return;
        }
        
        // Clear document first
        await clearDocument();
        
        // Wrap all document modifications in queueAsyncEdit
        await editor.queueAsyncEdit(() => {
            const document = editor.documentRoot;
            const pages = document.pages;
            
            // Get or create a page
            let page;
            if (pages.length === 0) {
                const firstPageData = documentState.pages[0];
                page = pages.addPage({ 
                    width: firstPageData.width || 1920, 
                    height: firstPageData.height || 1080 
                });
                console.log('✅ Created new page');
            } else {
                page = pages.item(0);
                console.log('✅ Using existing page');
            }
            
            // Set page dimensions if provided
            const firstPageData = documentState.pages[0];
            if (firstPageData.width && firstPageData.height) {
                page.width = firstPageData.width;
                page.height = firstPageData.height;
                console.log(`✅ Set page dimensions: ${firstPageData.width}x${firstPageData.height}`);
            }
            
            // Get or create an artboard
            const artboards = page.artboards;
            let artboard;
            if (artboards.length === 0) {
                artboard = artboards.addArtboard();
                console.log('✅ Created new artboard');
            } else {
                artboard = artboards.item(0);
                console.log('✅ Using existing artboard');
            }
            
            // Use deserializeElement to restore all elements with full properties
            if (firstPageData.artboards && firstPageData.artboards.length > 0) {
                const artboardData = firstPageData.artboards[0];
                console.log(`📦 Found artboard with ${artboardData.elements?.length || 0} elements`);
                
                if (artboardData.elements && artboardData.elements.length > 0) {
                    // Separate images from other elements (images need async processing)
                    const regularElements = [];
                    const imageElements = [];
                    
                    // Image types that need async loading
                    const imageTypes = ['Image', 'MediaContainerNode', 'ImageRectangleNode', 'ComplexShape', 'ComplexShapeNode'];
                    
                    for (let i = 0; i < artboardData.elements.length; i++) {
                        const elementData = artboardData.elements[i];
                        // Check if element is an image type with image data
                        const isImageType = imageTypes.includes(elementData.type);
                        const hasImageData = elementData.imageData || elementData.hasImageData;
                        
                        if (isImageType && hasImageData) {
                            imageElements.push(elementData);
                        } else {
                            regularElements.push(elementData);
                        }
                    }
                    
                    // First, deserialize all non-image elements synchronously
                    for (let i = 0; i < regularElements.length; i++) {
                        const elementData = regularElements[i];
                        console.log(`🔨 Deserializing element ${i + 1}/${regularElements.length}:`, elementData.type);
                        
                        try {
                            deserializeElement(elementData, artboard);
                            console.log(`✅ Successfully deserialized element ${i + 1}`);
                        } catch (elementError) {
                            console.error(`❌ Error deserializing element ${i + 1}:`, elementError, elementData);
                        }
                    }
                    
                    // Store image elements for async processing after queueAsyncEdit
                    if (imageElements.length > 0) {
                        console.log(`🖼️ Found ${imageElements.length} image(s) to load asynchronously`);
                        // We'll process images after this queueAsyncEdit completes
                        _pendingImages = imageElements.map(el => ({ elementData: el, artboard: artboard }));
                    }
                } else {
                    console.log('ℹ️ Artboard has no elements');
                }
            } else {
                console.log('ℹ️ Page has no artboards');
            }
        });
        
        // After queueAsyncEdit, process images asynchronously
        if (_pendingImages && _pendingImages.length > 0) {
            console.log(`🖼️ Processing ${_pendingImages.length} image(s)...`);
            
            for (const { elementData, artboard } of _pendingImages) {
                try {
                    await deserializeImage(elementData, artboard);
                } catch (imageError) {
                    console.error(`❌ Error deserializing image:`, imageError, elementData);
                }
            }
            
            // Clear pending images
            _pendingImages = null;
        }
        
        console.log('✅ Document imported successfully');
    } catch (error) {
        console.error('❌ Error importing document:', error);
        throw new Error(`Failed to import document: ${error.message}`);
    }
}

/**
 * Clear all elements from the current document
 * NOTE: All document modifications must be wrapped in editor.queueAsyncEdit()
 * because this function may be called after async operations
 */
async function clearDocument() {
    try {
        // Wrap all document modifications in queueAsyncEdit
        await editor.queueAsyncEdit(() => {
            const document = editor.documentRoot;
            const pages = document.pages;
            
            if (!pages || pages.length === 0) {
                console.log('Document is already empty');
                return;
            }
            
            // Clear all artboards in all pages
            const pageCount = pages.length;
            for (let i = 0; i < pageCount; i++) {
                const page = pages.item(i);
                if (!page) continue;
                
                const artboards = page.artboards;
                if (artboards && artboards.length > 0) {
                    const artboardCount = artboards.length;
                    for (let a = 0; a < artboardCount; a++) {
                        const artboard = artboards.item(a);
                        if (!artboard) continue;
                        
                        // Clear all children from artboard
                        const children = artboard.children;
                        if (children && children.length > 0) {
                            // Convert to array to avoid mutation during iteration
                            const childrenArray = children.toArray();
                            children.remove(...childrenArray);
                        }
                    }
                }
            }
        });
        
        console.log('Document cleared');
    } catch (error) {
        console.error('Error clearing document:', error);
        throw new Error(`Failed to clear document: ${error.message}`);
    }
}

/**
 * Get document metadata
 */
function getDocumentMetadata() {
    try {
        const document = editor.documentRoot;
        const pages = document.pages;
        
        if (!pages) {
            return {
                pageCount: 0,
                totalElements: 0,
                pages: [],
                timestamp: new Date().toISOString()
            };
        }
        
        let totalElements = 0;
        const pageInfo = [];
        const pageCount = pages.length;
        
        for (let i = 0; i < pageCount; i++) {
            const page = pages.item(i);
            if (!page) continue;
            
            // Count elements in all artboards
            let pageElementCount = 0;
            const artboards = page.artboards;
            if (artboards && artboards.length > 0) {
                const artboardCount = artboards.length;
                for (let a = 0; a < artboardCount; a++) {
                    const artboard = artboards.item(a);
                    if (artboard && artboard.children) {
                        pageElementCount += artboard.children.length;
                    }
                }
            }
            
            totalElements += pageElementCount;
            
            pageInfo.push({
                id: page.id || `page_${i}`,
                name: page.name || `Page ${i + 1}`,
                width: page.width,
                height: page.height,
                artboardCount: artboards ? artboards.length : 0,
                elementCount: pageElementCount
            });
        }
        
        return {
            pageCount: pageCount,
            totalElements: totalElements,
            pages: pageInfo,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error getting document metadata:', error);
        return {
            pageCount: 0,
            totalElements: 0,
            pages: [],
            timestamp: new Date().toISOString()
        };
    }
}

// ============================================
// MODULE: LEGACY API
// ============================================
// Maintains backward compatibility

/**
 * Create a rectangle (legacy function)
 */
function createRectangle() {
    try {
            const rectangle = editor.createRectangle();
            rectangle.width = 240;
            rectangle.height = 180;
            rectangle.translation = { x: 10, y: 10 };

            const color = { red: 0.32, green: 0.34, blue: 0.89, alpha: 1 };
            const rectangleFill = editor.makeColorFill(color);
            rectangle.fill = rectangleFill;

            const insertionParent = editor.context.insertionParent;
            insertionParent.children.append(rectangle);
        
        console.log('Rectangle created (legacy API)');
    } catch (error) {
        console.error('Error creating rectangle:', error);
        throw new Error(`Failed to create rectangle: ${error.message}`);
    }
}

// ============================================
// MAIN SANDBOX API
// ============================================
// Exposes all functions to the UI runtime

/**
 * Initialize the sandbox API
 */
function start() {
    console.log('Design Branch Manager: Sandbox initializing...');
    
    const sandboxApi = {
        // Document operations
        exportDocument: async () => {
            try {
                return await exportDocument();
            } catch (error) {
                console.error('Error in exportDocument API:', error);
                throw error;
            }
        },
        
        importDocument: async (documentState) => {
            try {
                await importDocument(documentState);
            } catch (error) {
                console.error('Error in importDocument API:', error);
                throw error;
            }
        },
        
        clearDocument: async () => {
            try {
                await clearDocument();
            } catch (error) {
                console.error('Error in clearDocument API:', error);
                throw error;
            }
        },
        
        getDocumentMetadata: () => {
            try {
                return getDocumentMetadata();
            } catch (error) {
                console.error('Error in getDocumentMetadata API:', error);
                throw error;
            }
        },
        
        // Branch operations
        initializeBranch: (branchId, branchName) => {
            try {
                initializeBranch(branchId, branchName);
                return { success: true };
            } catch (error) {
                console.error('Error in initializeBranch API:', error);
                throw error;
            }
        },
        
        getCurrentBranch: () => {
            try {
                return getCurrentBranch();
            } catch (error) {
                console.error('Error in getCurrentBranch API:', error);
                throw error;
            }
        },
        
        setCurrentBranch: (branchId, branchName) => {
            try {
                setCurrentBranch(branchId, branchName);
                return { success: true };
            } catch (error) {
                console.error('Error in setCurrentBranch API:', error);
                throw error;
            }
        },
        
        // State management
        getCurrentStateHash: async () => {
            try {
                return await getCurrentStateHash();
            } catch (error) {
                console.error('Error in getCurrentStateHash API:', error);
                throw error;
            }
        },
        
        hasUncommittedChanges: async (savedStateHash) => {
            try {
                if (!savedStateHash) {
                    return false;
                }
                const currentHash = await getCurrentStateHash();
                return currentHash !== savedStateHash;
            } catch (error) {
                console.error('Error in hasUncommittedChanges API:', error);
                return false;
            }
        },
        
        updateBranchStateHash: (hash) => {
            try {
                updateBranchStateHash(hash);
                return { success: true };
            } catch (error) {
                console.error('Error in updateBranchStateHash API:', error);
                throw error;
            }
        },
        
        resetBranchState: () => {
            try {
                resetBranchState();
                return { success: true };
            } catch (error) {
                console.error('Error in resetBranchState API:', error);
                throw error;
            }
        },
        
        // Legacy API
        createRectangle: () => {
            try {
                createRectangle();
                return { success: true };
            } catch (error) {
                console.error('Error in createRectangle API:', error);
                throw error;
            }
        }
    };
    
    // Expose the API to the UI runtime
    runtime.exposeApi(sandboxApi);
    
    console.log('Design Branch Manager: Sandbox initialized successfully');
    console.log('Available APIs:', Object.keys(sandboxApi));
}

// Start the sandbox
start();
