import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
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

const STREET_LEVEL_TYPES = ["street_address", "premise", "subpremise", "route", "establishment"];

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

async function resolvePlaceDetails(
  placeId: string,
  displayAddress: string
): Promise<SelectedPlace | null> {
  const place = new google.maps.places.Place({ id: placeId });
  await place.fetchFields({ fields: ["location", "addressComponents", "types"] });

  const loc = place.location;
  if (!loc) return null;

  const types = place.types ?? [];
  const hasStreetLevelType = types.some((t) => STREET_LEVEL_TYPES.includes(t));
  const isPostalCodeOnly = types.includes("postal_code") && !hasStreetLevelType;

  if (isPostalCodeOnly && place.addressComponents?.length) {
    const coords = await geocodeStreetAddress(place.addressComponents);
    if (coords) return { address: displayAddress, ...coords };
  }

  return {
    address: displayAddress,
    lat: loc.lat(),
    lng: loc.lng(),
  };
}

function mapsErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/REQUEST_DENIED|ApiNotActivated|not authorized/i.test(message)) {
    return "ה-API Key חסום או ש-Places API (New) לא מופעל ב-Google Cloud Console";
  }
  if (/referrer|RefererNotAllowed/i.test(message)) {
    return "ה-API Key מוגבל לדומיין אחר — הוסיפו את הדומיין הנוכחי בהגבלות המפתח";
  }
  return "לא ניתן לטעון הצעות כתובת מ-Google Maps";
}

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  onResolvingChange,
  placeholder,
  disabled,
}: AddressAutocompleteProps) {
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const onChangeRef = useRef(onChange);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [inputValue, setInputValue] = useState(value);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
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
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
        setReady(true);
      })
      .catch((error) => setLoadError(mapsErrorMessage(error)));
  }, []);

  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if ((target as Element).closest?.(`[data-address-menu="${menuId}"]`)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [menuId]);

  useEffect(() => {
    if (!open || predictions.length === 0) return;

    const updatePosition = () => {
      const el = inputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const idealHeight = Math.min(predictions.length * 42 + 8, 240);
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 8);
      const spaceAbove = Math.max(0, rect.top - 8);
      const showAbove = spaceBelow < Math.min(idealHeight, 120) && spaceAbove > spaceBelow;
      const maxHeight = Math.min(idealHeight, showAbove ? spaceAbove : spaceBelow || idealHeight);

      setMenuStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        maxHeight: maxHeight > 0 ? maxHeight : idealHeight,
        zIndex: 10001,
        ...(showAbove
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, predictions.length]);

  useEffect(() => {
    if (!ready || disabled || selectionLocked) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = inputValue.trim();
    if (query.length < 2) {
      setPredictions([]);
      setOpen(false);
      setLoadingPredictions(false);
      return;
    }

    let cancelled = false;

    debounceRef.current = setTimeout(() => {
      void (async () => {
        setLoadingPredictions(true);
        try {
          const { suggestions } =
            await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
              input: query,
              includedRegionCodes: ["il"],
              sessionToken: sessionTokenRef.current ?? undefined,
            });

          if (cancelled) return;

          const items = suggestions
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => !!p?.placeId)
            .map((p) => ({ placeId: p.placeId, description: p.text.text }));

          setPredictions(items);
          setOpen(items.length > 0);
        } catch (error) {
          if (cancelled) return;
          setPredictions([]);
          setOpen(false);
          setLoadError(mapsErrorMessage(error));
        } finally {
          if (!cancelled) setLoadingPredictions(false);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, ready, disabled, selectionLocked]);

  async function selectPrediction(item: Prediction) {
    setOpen(false);
    setPredictions([]);
    setSelectionLocked(true);
    setInputValue(item.description);
    onResolvingChange?.(true);

    try {
      const details = await resolvePlaceDetails(item.placeId, item.description);
      sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();

      if (!details) {
        setSelectionLocked(false);
        return;
      }

      setInputValue(details.address);
      onPlaceSelectRef.current(details);
    } catch {
      setSelectionLocked(false);
    } finally {
      onResolvingChange?.(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => {
          setSelectionLocked(false);
          setLoadError(null);
          setInputValue(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => predictions.length > 0 && setOpen(true)}
        placeholder={placeholder ?? "הקלידו כתובת והבחרו מהרשימה"}
        disabled={disabled || (!ready && !loadError)}
        autoComplete="off"
      />

      {open &&
        predictions.length > 0 &&
        createPortal(
          <ul
            data-address-menu={menuId}
            className="address-suggestions address-suggestions--portal"
            style={menuStyle}
            role="listbox"
          >
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
          </ul>,
          document.body
        )}

      {loadingPredictions && !loadError && (
        <p className="mt-1 text-[12px] text-text-3">טוען הצעות...</p>
      )}
      {loadError && <p className="mt-1.5 text-[12px] font-semibold text-danger">{loadError}</p>}
    </div>
  );
}
