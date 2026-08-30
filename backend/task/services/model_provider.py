import requests
from decouple import config
from django.conf import settings

class ModelProvider:
    """
    Interface boundary for runtime LLM execution.
    """
    def generate(self, prompt: str, system_instruction: str = None, api_key: str = None, model: str = None) -> tuple[str, str]:
        """
        Returns a tuple of (result_text, mode_string) where mode_string is 'REAL' or 'SIMULATED'.
        """
        raise NotImplementedError("Subclasses must implement generate()")

class RealGeminiModelProvider(ModelProvider):
    def __init__(self, api_key: str = None):
        self.api_key = api_key or config("GEMINI_API_KEY", default="")

    def generate(self, prompt: str, system_instruction: str = None, api_key: str = None, model: str = None) -> tuple[str, str]:
        key = api_key or self.api_key
        if not key:
            return "Error: API key is not configured.", "REAL"

        model_name = model or "gemini-1.5-flash"
        # URL key parameter removed for security - key is sent via header
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": key
        }
        contents = [{
            "parts": [{"text": prompt}]
        }]
        data = {
            "contents": contents
        }
        if system_instruction:
            data["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        try:
            response = requests.post(url, json=data, headers=headers, timeout=30)
            if response.status_code == 200:
                res_data = response.json()
                text = res_data['candidates'][0]['content']['parts'][0]['text']
                return text, "REAL"
            else:
                return f"Error: API returned status code {response.status_code}. Detail: {response.text}", "REAL"
        except Exception as e:
            return f"Error: Failed to connect to model provider. Detail: {str(e)}", "REAL"

class OpenAICompatibleModelProvider(ModelProvider):
    def __init__(self, base_url: str, default_model: str):
        self.base_url = base_url
        self.default_model = default_model

    def generate(self, prompt: str, system_instruction: str = None, api_key: str = None, model: str = None) -> tuple[str, str]:
        if not api_key:
            return "Error: API key is not configured.", "REAL"
        
        url = f"{self.base_url.rstrip('/')}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        data = {
            "model": model or self.default_model,
            "messages": messages
        }
        try:
            response = requests.post(url, json=data, headers=headers, timeout=30)
            if response.status_code == 200:
                res_data = response.json()
                text = res_data['choices'][0]['message']['content']
                return text, "REAL"
            else:
                return f"Error: API returned status code {response.status_code}. Detail: {response.text}", "REAL"
        except Exception as e:
            return f"Error: Failed to connect to model provider. Detail: {str(e)}", "REAL"

class FakeModelProvider(ModelProvider):
    def generate(self, prompt: str, system_instruction: str = None, api_key: str = None, model: str = None) -> tuple[str, str]:
        # Deterministic simulation for tests and offline development
        return f"[Simulated Response] Mode: SIMULATED. Prompt: {prompt}", "SIMULATED"

def get_model_provider_for_agent(agent) -> tuple[ModelProvider, bool]:
    """
    Returns a tuple of (ModelProviderInstance, is_real).
    """
    provider_id = agent.provider.lower()
    if provider_id in ("simulated", "fake"):
        return FakeModelProvider(), False

    # Real providers
    if provider_id == "gemini":
        return RealGeminiModelProvider(), True
    elif provider_id == "groq":
        base_url = getattr(settings, "GROQ_BASE_URL", "https://api.groq.com/openai/v1")
        default_model = getattr(settings, "GROQ_DEFAULT_MODEL", "llama3-8b-8192")
        return OpenAICompatibleModelProvider(base_url, default_model), True
    elif provider_id == "nvidia_nim":
        base_url = getattr(settings, "NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
        default_model = getattr(settings, "NVIDIA_NIM_DEFAULT_MODEL", "meta/llama-3.1-8b-instruct")
        return OpenAICompatibleModelProvider(base_url, default_model), True
    elif provider_id == "openclaw":
        base_url = getattr(settings, "OPENCLAW_BASE_URL", "http://localhost:8000/v1")
        default_model = getattr(settings, "OPENCLAW_DEFAULT_MODEL", "gpt-3.5-turbo")
        return OpenAICompatibleModelProvider(base_url, default_model), True
    elif provider_id == "opencode":
        base_url = getattr(settings, "OPENCODE_BASE_URL", "http://localhost:8001/v1")
        default_model = getattr(settings, "OPENCODE_DEFAULT_MODEL", "gpt-3.5-turbo")
        return OpenAICompatibleModelProvider(base_url, default_model), True
    else:
        raise ValueError(f"Unsupported AI Provider: '{agent.provider}'")

def get_model_provider_by_name(provider_name: str) -> tuple[ModelProvider, bool]:
    """
    Returns a tuple of (ModelProviderInstance, is_real) based on provider name.
    """
    provider_id = provider_name.lower()
    if provider_id in ("simulated", "fake"):
        return FakeModelProvider(), False

    # Real providers
    if provider_id == "gemini":
        return RealGeminiModelProvider(), True
    elif provider_id == "groq":
        base_url = getattr(settings, "GROQ_BASE_URL", "https://api.groq.com/openai/v1")
        default_model = getattr(settings, "GROQ_DEFAULT_MODEL", "llama-3.3-70b-versatile")
        return OpenAICompatibleModelProvider(base_url, default_model), True
    elif provider_id == "nvidia_nim":
        base_url = getattr(settings, "NVIDIA_NIM_BASE_URL", "https://integrate.api.nvidia.com/v1")
        default_model = getattr(settings, "NVIDIA_NIM_DEFAULT_MODEL", "meta/llama-3.1-8b-instruct")
        return OpenAICompatibleModelProvider(base_url, default_model), True
    elif provider_id == "openclaw":
        base_url = getattr(settings, "OPENCLAW_BASE_URL", "http://localhost:8000/v1")
        default_model = getattr(settings, "OPENCLAW_DEFAULT_MODEL", "gpt-3.5-turbo")
        return OpenAICompatibleModelProvider(base_url, default_model), True
    elif provider_id == "opencode":
        base_url = getattr(settings, "OPENCODE_BASE_URL", "http://localhost:8001/v1")
        default_model = getattr(settings, "OPENCODE_DEFAULT_MODEL", "gpt-3.5-turbo")
        return OpenAICompatibleModelProvider(base_url, default_model), True
    else:
        raise ValueError(f"Unsupported AI Provider: '{provider_name}'")
