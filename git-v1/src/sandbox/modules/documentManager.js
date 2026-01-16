/**
 * ============================================
 * DOCUMENT MANAGER MODULE
 * ============================================
 * 
 * Handles exporting and importing Adobe Express document state.
 * This module provides functions to:
 * - Export the current document to JSON format
 * - Import a document from JSON format
 * - Clear the document before importing
 * - Get document metadata
 */

import { editor } from "express-document-sdk";

/**
 * Export the current document state to JSON
 * This captures the entire document structure including all elements
 * 
 * @returns {Promise<Object>} Document state as JSON object
 */
export async function exportDocument() {
    try {
        // Get the document root
        const document = editor.documentRoot;
        
        // Export document structure
        // Note: Adobe Express SDK provides document serialization
        // We'll need to traverse the document tree and extract all elements
        
        const documentState = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            pages: [],
            elements: []
        };
        
        // Get all pages in the document
        const pages = document.pages;
        if (pages && pages.length > 0) {
            for (let i = 0; i < pages.length; i++) {
                const page = pages.get(i);
                const pageData = {
                    id: page.id || `page_${i}`,
                    name: page.name || `Page ${i + 1}`,
                    width: page.width,
                    height: page.height,
                    elements: []
                };
                
                // Get all elements on this page
                const elements = page.children;
                if (elements && elements.length > 0) {
                    for (let j = 0; j < elements.length; j++) {
                        const element = elements.get(j);
                        const elementData = serializeElement(element);
                        if (elementData) {
                            pageData.elements.push(elementData);
                        }
                    }
                }
                
                documentState.pages.push(pageData);
            }
        }
        
        return documentState;
    } catch (error) {
        console.error('Error exporting document:', error);
        throw new Error(`Failed to export document: ${error.message}`);
    }
}

/**
 * Serialize a single element to JSON
 * Handles different element types (text, shapes, images, etc.)
 * 
 * @param {Object} element - The element to serialize
 * @returns {Object|null} Serialized element data or null if unsupported
 */
function serializeElement(element) {
    try {
        const baseData = {
            id: element.id,
            type: element.constructor.name || 'Unknown',
            translation: element.translation ? {
                x: element.translation.x,
                y: element.translation.y
            } : null,
            rotation: element.rotation || 0,
            opacity: element.opacity !== undefined ? element.opacity : 1
        };
        
        // Handle different element types
        if (element.width !== undefined) {
            baseData.width = element.width;
        }
        if (element.height !== undefined) {
            baseData.height = element.height;
        }
        
        // Handle fills
        if (element.fill) {
            baseData.fill = serializeFill(element.fill);
        }
        
        // Handle strokes
        if (element.stroke) {
            baseData.stroke = serializeStroke(element.stroke);
        }
        
        // Handle text content
        if (element.text !== undefined) {
            baseData.text = element.text;
        }
        
        // Handle children (for groups)
        if (element.children && element.children.length > 0) {
            baseData.children = [];
            for (let i = 0; i < element.children.length; i++) {
                const child = element.children.get(i);
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
 * Serialize fill property
 * 
 * @param {Object} fill - Fill object
 * @returns {Object} Serialized fill data
 */
function serializeFill(fill) {
    if (!fill) return null;
    
    const fillData = {
        type: fill.constructor.name || 'Unknown'
    };
    
    // Handle color fill
    if (fill.color) {
        fillData.color = {
            red: fill.color.red,
            green: fill.color.green,
            blue: fill.color.blue,
            alpha: fill.color.alpha !== undefined ? fill.color.alpha : 1
        };
    }
    
    // Handle gradient fill
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
 * 
 * @param {Object} stroke - Stroke object
 * @returns {Object} Serialized stroke data
 */
function serializeStroke(stroke) {
    if (!stroke) return null;
    
    return {
        width: stroke.width,
        color: stroke.color ? {
            red: stroke.color.red,
            green: stroke.color.green,
            blue: stroke.color.blue,
            alpha: stroke.color.alpha !== undefined ? stroke.color.alpha : 1
        } : null
    };
}

/**
 * Import document from JSON state
 * This replaces the current document content with the imported state
 * 
 * @param {Object} documentState - Document state as JSON object
 * @returns {Promise<void>}
 */
export async function importDocument(documentState) {
    try {
        if (!documentState || !documentState.pages) {
            throw new Error('Invalid document state: missing pages');
        }
        
        // Clear current document first
        await clearDocument();
        
        const document = editor.documentRoot;
        
        // Import pages
        for (const pageData of documentState.pages) {
            // Create or get page
            let page;
            const pages = document.pages;
            
            // For now, we'll work with the first page or create a new one
            if (pages.length === 0) {
                // Create a new page if none exists
                // Note: Adobe Express SDK may have specific page creation methods
                // This is a placeholder - actual implementation depends on SDK API
                page = pages.add();
            } else {
                page = pages.get(0);
            }
            
            // Set page properties
            if (pageData.width && pageData.height) {
                page.width = pageData.width;
                page.height = pageData.height;
            }
            
            // Import elements
            if (pageData.elements && pageData.elements.length > 0) {
                for (const elementData of pageData.elements) {
                    await deserializeElement(elementData, page);
                }
            }
        }
        
        console.log('Document imported successfully');
    } catch (error) {
        console.error('Error importing document:', error);
        throw new Error(`Failed to import document: ${error.message}`);
    }
}

/**
 * Deserialize and add an element to the document
 * 
 * @param {Object} elementData - Element data from JSON
 * @param {Object} parent - Parent container (page or group)
 * @returns {Promise<void>}
 */
async function deserializeElement(elementData, parent) {
    try {
        let element;
        
        // Create element based on type
        switch (elementData.type) {
            case 'Rectangle':
                element = editor.createRectangle();
                if (elementData.width) element.width = elementData.width;
                if (elementData.height) element.height = elementData.height;
                break;
                
            case 'Ellipse':
                element = editor.createEllipse();
                if (elementData.width) element.width = elementData.width;
                if (elementData.height) element.height = elementData.height;
                break;
                
            case 'Text':
                element = editor.createText();
                if (elementData.text) element.text = elementData.text;
                break;
                
            default:
                // Try to create rectangle as fallback
                element = editor.createRectangle();
                console.warn(`Unknown element type: ${elementData.type}, creating rectangle`);
        }
        
        // Set properties
        if (elementData.translation) {
            element.translation = {
                x: elementData.translation.x,
                y: elementData.translation.y
            };
        }
        
        if (elementData.rotation !== undefined) {
            element.rotation = elementData.rotation;
        }
        
        if (elementData.opacity !== undefined) {
            element.opacity = elementData.opacity;
        }
        
        // Apply fill
        if (elementData.fill) {
            element.fill = deserializeFill(elementData.fill);
        }
        
        // Apply stroke
        if (elementData.stroke) {
            element.stroke = deserializeStroke(elementData.stroke);
        }
        
        // Add to parent
        parent.children.append(element);
        
        // Handle children (for groups)
        if (elementData.children && elementData.children.length > 0) {
            for (const childData of elementData.children) {
                await deserializeElement(childData, element);
            }
        }
    } catch (error) {
        console.warn('Error deserializing element:', error);
    }
}

/**
 * Deserialize fill property
 * 
 * @param {Object} fillData - Fill data from JSON
 * @returns {Object} Fill object
 */
function deserializeFill(fillData) {
    if (!fillData) return null;
    
    // Handle color fill
    if (fillData.color) {
        return editor.makeColorFill({
            red: fillData.color.red,
            green: fillData.color.green,
            blue: fillData.color.blue,
            alpha: fillData.color.alpha !== undefined ? fillData.color.alpha : 1
        });
    }
    
    // Handle gradient fill (if supported)
    if (fillData.gradient) {
        // TODO: Implement gradient fill deserialization
        console.warn('Gradient fill deserialization not yet implemented');
        return null;
    }
    
    return null;
}

/**
 * Deserialize stroke property
 * 
 * @param {Object} strokeData - Stroke data from JSON
 * @returns {Object} Stroke object
 */
function deserializeStroke(strokeData) {
    if (!strokeData) return null;
    
    // TODO: Implement stroke deserialization
    // Adobe Express SDK may have specific stroke creation methods
    console.warn('Stroke deserialization not yet implemented');
    return null;
}

/**
 * Clear all elements from the current document
 * 
 * @returns {Promise<void>}
 */
export async function clearDocument() {
    try {
        const document = editor.documentRoot;
        const pages = document.pages;
        
        // Clear all pages
        // Note: Adobe Express SDK may have specific methods for clearing
        // This is a placeholder - actual implementation depends on SDK API
        while (pages.length > 0) {
            // Remove elements from first page
            const page = pages.get(0);
            const elements = page.children;
            while (elements.length > 0) {
                elements.remove(0);
            }
            
            // If we can remove pages, do so (except the first one)
            // Otherwise, just clear the first page
            if (pages.length > 1) {
                // Remove page if SDK supports it
                // pages.remove(0);
            } else {
                break;
            }
        }
        
        console.log('Document cleared');
    } catch (error) {
        console.error('Error clearing document:', error);
        throw new Error(`Failed to clear document: ${error.message}`);
    }
}

/**
 * Get document metadata (size, element count, etc.)
 * 
 * @returns {Object} Document metadata
 */
export function getDocumentMetadata() {
    try {
        const document = editor.documentRoot;
        const pages = document.pages;
        
        let totalElements = 0;
        const pageInfo = [];
        
        for (let i = 0; i < pages.length; i++) {
            const page = pages.get(i);
            const elementCount = page.children ? page.children.length : 0;
            totalElements += elementCount;
            
            pageInfo.push({
                id: page.id || `page_${i}`,
                name: page.name || `Page ${i + 1}`,
                width: page.width,
                height: page.height,
                elementCount: elementCount
            });
        }
        
        return {
            pageCount: pages.length,
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
