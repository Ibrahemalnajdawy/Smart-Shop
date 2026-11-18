const API_BASE = import.meta.env.VITE_API_URL || "";

async function request(path) {
  const response = await fetch(`${API_BASE}/api${path}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || "Something went wrong. Please try again.");
  }
  return response.json();
}

async function authRequest(path, body, token) {
  const response = await fetch(`${API_BASE}/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || "We couldn't complete that request. Please try again.");
  }
  return response.json();
}

async function postRequest(path, body) {
  const response = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.message || "We couldn't complete that request. Please try again.");
  }
  return response.json();
}

export const getProducts = (params = {}) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== "" && value != null),
  );
  return request(`/products${query.size ? `?${query}` : ""}`);
};

export const getRecommendations = (budget, category) => {
  const query = new URLSearchParams({ budget, ...(category ? { category } : {}) });
  return request(`/recommendations?${query}`);
};

export const compareProducts = (ids) =>
  request(`/products/compare?ids=${encodeURIComponent(ids.join(","))}`);

export const register = (details) => authRequest("/register", details);
export const login = (credentials) => authRequest("/login", credentials);
export const getCurrentUser = (token) => authRequest("/me", null, token);
export const getPayPalConfig = () => request("/payments/paypal/config");
export const createPayPalOrder = (order) => postRequest("/payments/paypal/orders", order);
export const capturePayPalOrder = (orderId, captureToken) =>
  postRequest(`/payments/paypal/orders/${encodeURIComponent(orderId)}/capture`, { captureToken });
