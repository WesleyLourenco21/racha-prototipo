let selectedLocation = null;

export function selectLocation(location) {
    selectedLocation = location;
}

export function getSelectedLocation() {
    return selectedLocation;
}
