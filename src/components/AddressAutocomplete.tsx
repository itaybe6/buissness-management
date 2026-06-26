import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui";
import { getGoogleMapsApiKey, loadGoogleMapsPlaces } from "@/lib/googleMaps";

export interface SelectedPlace {
  address: string;
  lat: number;
  lng: number;
}

interface Prediction {
  placeId: string;
  description: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onPlaceSelect: (place: SelectedPlace) => void;
  onResolvingChange?: (resolving: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
}

function getPlaceDetails(placeId: string, displayAddress: string): Promise<SelectedPlace | null> {
  return new Promise((resolve) => {
    const service = new google.maps.places.PlacesService(document.createElement("div"));
    service.getDetails(
      { placeId, fields: ["geometry", "address_components", "types"] },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
          resolve(null);
          return;
        }

        const loc = place.geometry.location;
        const types = place.types ?? [];
        const hasStreetLevelType = types.some((t) =>
          ["street_address", "premise", "subpremise", "route", "establishment"].includes(t)
        );
        const isPostalCodeOnly = types.includes("postal_code") && !hasStreetLevelType;

        if (isPostalCodeOnly && place.address_components?.length) {
          void geocodeStreetAddress(place.address_components).then((coords) => {
            if (coords) {
              resolve({ address: displayAddress, ...coords });
              return;
            }
            resolve({
              address: displayAddress,
              lat: loc.lat(),
              lng: loc.lng(),
            });
          });
          return;
        }

        resolve({
          address: displayAddress,
          lat: loc.lat(),
          lng: loc.lng(),
        });
      }
    );
  });
}

function geocodeStreetAddress(
  components: google.maps.GeocoderAddressComponent[]
): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    const byType = (type: string) => components.find((c) => c.types.includes(type))?.long_name;
    const streetNumber = byType("street_number");
    const route = byType("route");
    const locality = byType("locality") ?? byType("administrative_area_level_2");

    const streetLine = [route, streetNumber].filter(Boolean).join(" ");
    if (!streetLine || !locality) {
      resolve(null);
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode(
      { address: `${streetLine}, ${locality}`, componentRestrictions: { country: "IL" } },
      (results, status) => {
        const location = results?.[0]?.geometry?.location;
        if (status !== google.maps.GeocoderStatus.OK || !location) {
          resolve(null);
          return;
        }
        resolve({ lat: location.lat(), lng: location.lng() });
      }
    );
  });
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  onResolvingChange,
  placeholder,
  disabled,
}: AddressAutocompleteProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const onChangeRef = useRef(onChange);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [inputValue, setInputValue] = useState(value);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingPredictions, setLoadingPredictions] = useState(false);
  const [selectionLocked, setSelectionLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  onPlaceSelectRef.current = onPlaceSelect;
  onChangeRef.current = onChange;

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (!getGoogleMapsApiKey()) {
      setLoadError("חסר מפתח Google Maps. הוסיפו VITE_GOOGLE_MAPS_API_KEY לקובץ .env");
      return;
    }
    loadGoogleMapsPlaces()
      .then(() => {
        autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
        setReady(true);
      })
      .catch(() => setLoadError("לא ניתן לטעון את Google Maps"));
  }, []);

  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  useEffect(() => {
    if (!ready || disabled || selectionLocked) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = inputValue.trim();
    if (query.length < 2) {
      setPredictions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setLoadingPredictions(true);
      autocompleteServiceRef.current?.getPlacePredictions(
        {
          input: query,
          componentRestrictions: { country: "il" },
          sessionToken: sessionTokenRef.current ?? undefined,
        },
        (results, status) => {
          setLoadingPredictions(false);
          if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) {
            setPredictions([]);
            setOpen(false);
            return;
          }
          setPredictions(
            results
              .filter((r) => r.place_id)
              .map((r) => ({ placeId: r.place_id!, description: r.description }))
          );
          setOpen(true);
        }
      );
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, ready, disabled, selectionLocked]);

  async function selectPrediction(item: Prediction) {
    setOpen(false);
    setPredictions([]);
    setSelectionLocked(true);
    setInputValue(item.description);
    onResolvingChange?.(true);

    const details = await getPlaceDetails(item.placeId, item.description);
    sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
    onResolvingChange?.(false);

    if (!details) {
      setSelectionLocked(false);
      return;
    }

    setInputValue(details.address);
    onPlaceSelectRef.current(details);
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={inputValue}
        onChange={(e) => {
          setSelectionLocked(false);
          setInputValue(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        placeholder={placeholder ?? "הקלידו כתובת והבחרו מהרשימה"}
        disabled={disabled || (!ready && !loadError)}
        autoComplete="off"
      />

      {open && predictions.length > 0 && (
        <ul className="address-suggestions" role="listbox">
          {predictions.map((item) => (
            <li key={item.placeId} role="option">
              <button
                type="button"
                className="address-suggestion-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void selectPrediction(item)}
              >
                <span className="material-symbols-rounded address-suggestion-icon">location_on</span>
                <span>{item.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {loadingPredictions && !loadError && (
        <p className="mt-1 text-[12px] text-text-3">טוען הצעות...</p>
      )}
      {loadError && <p className="mt-1.5 text-[12px] font-semibold text-danger">{loadError}</p>}
    </div>
  );
}
