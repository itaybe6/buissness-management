declare namespace google.maps {
  class LatLng {
    lat(): number;
    lng(): number;
  }

  namespace places {
    interface PlaceResult {
      formatted_address?: string;
      name?: string;
      geometry?: { location?: LatLng };
    }

    class Autocomplete {
      constructor(input: HTMLInputElement, opts?: { componentRestrictions?: { country: string }; fields?: string[] });
      addListener(event: "place_changed", handler: () => void): MapsEventListener;
      getPlace(): PlaceResult;
    }
  }

  interface MapsEventListener {
    remove(): void;
  }

  namespace event {
    function removeListener(listener: MapsEventListener): void;
  }
}
