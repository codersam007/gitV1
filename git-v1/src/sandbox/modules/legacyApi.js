/**
 * ============================================
 * LEGACY API MODULE
 * ============================================
 * 
 * Maintains backward compatibility with existing API calls.
 * This module provides legacy functions that may be used by the UI.
 */

import { editor } from "express-document-sdk";

/**
 * Create a rectangle (legacy function)
 * Maintained for backward compatibility
 * 
 * @returns {void}
 */
export function createRectangle() {
    try {
        const rectangle = editor.createRectangle();

        // Define rectangle dimensions.
        rectangle.width = 240;
        rectangle.height = 180;

        // Define rectangle position.
        rectangle.translation = { x: 10, y: 10 };

        // Define rectangle color.
        const color = { red: 0.32, green: 0.34, blue: 0.89, alpha: 1 };

        // Fill the rectangle with the color.
        const rectangleFill = editor.makeColorFill(color);
        rectangle.fill = rectangleFill;

        // Add the rectangle to the document.
        const insertionParent = editor.context.insertionParent;
        insertionParent.children.append(rectangle);
        
        console.log('Rectangle created (legacy API)');
    } catch (error) {
        console.error('Error creating rectangle:', error);
        throw new Error(`Failed to create rectangle: ${error.message}`);
    }
}
