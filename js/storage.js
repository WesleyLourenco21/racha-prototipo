export const Storage = Object.freeze({
    get(key, fallback = null) {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : JSON.parse(value);
        } catch (error) {
            console.error(`Não foi possível carregar "${key}" do armazenamento local.`, error);
            return fallback;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`Não foi possível salvar "${key}" no armazenamento local.`, error);
            return false;
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    }
});
