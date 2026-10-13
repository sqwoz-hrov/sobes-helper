const DISABLED_CLASS = 'content-protection-disabled';

function updateContentProtectionIndicator(isContentProtectionOn) {
    document.documentElement.classList.toggle(DISABLED_CLASS, !isContentProtectionOn);
    document.dispatchEvent(new CustomEvent('content-protection-indicator-changed', {
        detail: { isContentProtectionOn },
    }));
}

export async function initializeContentProtectionIndicator() {
    const contentProtectionApi = window.api?.common;
    if (!contentProtectionApi) return;

    contentProtectionApi.onContentProtectionChanged((_, isContentProtectionOn) => {
        updateContentProtectionIndicator(isContentProtectionOn);
    });

    try {
        const isContentProtectionOn = await contentProtectionApi.getContentProtectionStatus();
        updateContentProtectionIndicator(isContentProtectionOn);
    } catch (error) {
        console.error('Failed to initialize content protection indicator:', error);
    }
}
