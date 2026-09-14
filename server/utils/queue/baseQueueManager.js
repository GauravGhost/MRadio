import logger from "../logger.js";

class BaseQueueManager {
    constructor(options = {}) {
        this.items = [];
        this.options = {
            readFunction: null,      // Function to read data from storage
            saveFunction: null,      // Function to save data to storage
            validateFunction: null,  // Function to validate items
            formatFunction: null,    // Function to format items
            duplicateCheckKey: null, // Key to check for duplicates
            ...options
        };
        this.initialize();
    }

    initialize() {
        if (this.options.readFunction) {
            this.items = this.readItems() || [];
        }
    }

    readItems() {
        try {
            return this.options.readFunction();
        } catch (error) {
            logger.error("Error reading items:", { message: error.message, stack: error.stack });
            return [];
        }
    }

    saveItems() {
        if (this.options.saveFunction) {
            try {
                this.options.saveFunction(this.items);
            } catch (error) {
                logger.error("Error saving items:", { error });
            }
        }
    }

    validateItem(item) {
        if (this.options.validateFunction) {
            return this.options.validateFunction(item);
        }
        return true;
    }

    formatItem(item) {
        if (this.options.formatFunction) {
            return this.options.formatFunction(item);
        }
        return item;
    }

    isDuplicate(item) {
        if (!this.options.duplicateCheckKey) return false;
        return this.items.some(existingItem => 
            existingItem[this.options.duplicateCheckKey] === item[this.options.duplicateCheckKey]
        );
    }

    add(item) {
        if (!this.validateItem(item)) {
            logger.error("Invalid item:", { item });
            return false;
        }

        if (this.isDuplicate(item)) {
            logger.warn("Duplicate item not added:", { item });
            return false;
        }

        const formattedItem = this.formatItem(item);
        this.items.push(formattedItem);
        this.saveItems();
        return true;
    }

    addToFront(item) {
        if (!this.validateItem(item)) {
            logger.error("Invalid item:", { item });
            return false;
        }

        if (this.isDuplicate(item)) {
            logger.warn("Duplicate item not added:", { item });
            return false;
        }

        const formattedItem = this.formatItem(item);
        this.items.unshift(formattedItem);
        this.saveItems();
        return true;
    }

    addMany(items, addToFront = false) {
        if (!Array.isArray(items)) {
            logger.error("Invalid input. Items must be an array.");
            return 0;
        }

        let addedCount = 0;
        const validItems = [];

        items.forEach(item => {
            if (this.validateItem(item) && !this.isDuplicate(item)) {
                const formattedItem = this.formatItem(item);
                validItems.push(formattedItem);
                addedCount++;
            }
        });

        if (addedCount > 0) {
            if (addToFront) {
                this.items.unshift(...validItems);
            } else {
                this.items.push(...validItems);
            }
            this.saveItems();
        }

        return addedCount;
    }

    removeFromFront() {
        if (this.items.length > 0) {
            const removedItem = this.items.shift();
            this.saveItems();
            return removedItem;
        }
        logger.warn("No items to remove from front");
        return null;
    }

    removeFromBack() {
        if (this.items.length > 0) {
            const removedItem = this.items.pop();
            this.saveItems();
            return removedItem;
        }
        logger.warn("No items to remove from back");
        return null;
    }

    removeAtIndex(index) {
        const actualIndex = index - 1; // Convert to 0-based index
        if (actualIndex >= 0 && actualIndex < this.items.length) {
            const removedItem = this.items.splice(actualIndex, 1)[0];
            this.saveItems();
            return removedItem;
        }
        logger.error("Invalid index or no items to remove");
        return null;
    }

    updateByKey(key, value, updates) {
        const index = this.items.findIndex(item => item[key] === value);
        if (index === -1) {
            logger.warn("No item found to update:", { [key]: value });
            return null;
        }
        this.items[index] = this.formatItem({ ...this.items[index], ...updates });
        this.saveItems();
        return this.items[index];
    }

    removeWhere(predicate) {
        const remaining = this.items.filter(item => !predicate(item));
        const removedCount = this.items.length - remaining.length;
        if (removedCount > 0) {
            this.items = remaining;
            this.saveItems();
        }
        return removedCount;
    }

    getFirst() {
        return this.items.length > 0 ? this.items[0] : null;
    }

    getLast() {
        return this.items.length > 0 ? this.items[this.items.length - 1] : null;
    }

    getAll() {
        return this.items;
    }

    clear() {
        this.items = [];
        this.saveItems();
    }

    getLength() {
        return this.items.length;
    }
}

export default BaseQueueManager;
