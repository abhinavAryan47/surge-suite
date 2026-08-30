import React, { useState } from 'react';
import { Mic, MicOff, Globe, AlertCircle } from 'lucide-react';
import { VOICE_LANGUAGES } from '../hooks/useVoiceRecognition';

export default function VoiceCommandButton({
  isListening,
  onStart,
  onStop,
  selectedLanguage,
  onLanguageChange,
  error,
  isSupported = true,
  disabled = false,
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (!isSupported) {
    return (
      <div style={styles.unsupportedBadge} title="Voice commands require a browser with Web Speech API support (Chrome, Edge, Safari)">
        <MicOff size={14} style={{ marginRight: '6px', color: 'var(--text-muted)' }} />
        <span style={styles.unsupportedText}>Voice unsupported</span>
      </div>
    );
  }

  const currentLangObj =
    VOICE_LANGUAGES.find((l) => l.code === selectedLanguage) || VOICE_LANGUAGES[0];

  return (
    <div style={styles.container}>
      {/* Microphone Toggle Button */}
      <button
        type="button"
        onClick={isListening ? onStop : onStart}
        disabled={disabled}
        title={isListening ? 'Click to stop listening' : `Click to speak in ${currentLangObj.label}`}
        style={{
          ...styles.micButton,
          backgroundColor: isListening ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-hover)',
          borderColor: isListening ? 'var(--status-error, #ef4444)' : 'var(--border-medium)',
          color: isListening ? 'var(--status-error, #ef4444)' : 'var(--text-primary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {isListening ? (
          <>
            <span style={styles.recordingPulse} />
            <MicOff size={15} style={{ marginRight: '6px' }} />
            <span style={styles.btnText}>Listening ({currentLangObj.nativeLabel})...</span>
          </>
        ) : (
          <>
            <Mic size={15} style={{ marginRight: '6px' }} />
            <span style={styles.btnText}>Voice Input</span>
          </>
        )}
      </button>

      {/* Language Selector Dropdown */}
      <div style={styles.langDropdownWrapper}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          disabled={disabled || isListening}
          title="Change Voice Input Language"
          style={styles.langToggleBtn}
        >
          <Globe size={13} style={{ marginRight: '4px', color: 'var(--text-muted)' }} />
          <span style={styles.langCodeText}>{currentLangObj.nativeLabel}</span>
        </button>

        {dropdownOpen && (
          <>
            <div style={styles.backdrop} onClick={() => setDropdownOpen(false)} />
            <div style={styles.dropdownMenu}>
              <div style={styles.dropdownHeader}>Select Voice Language</div>
              <div style={styles.dropdownList}>
                {VOICE_LANGUAGES.map((lang) => {
                  const isSelected = lang.code === selectedLanguage;
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => {
                        onLanguageChange(lang.code);
                        setDropdownOpen(false);
                      }}
                      style={{
                        ...styles.dropdownItem,
                        backgroundColor: isSelected ? 'var(--bg-hover)' : 'transparent',
                        fontWeight: isSelected ? '600' : '400',
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      <span>{lang.nativeLabel}</span>
                      <span style={styles.dropdownSubText}>{lang.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Error Alert Display */}
      {error && (
        <div style={styles.errorBanner} role="alert">
          <AlertCircle size={13} style={{ marginRight: '6px', flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  micButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid',
    fontSize: '12px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    position: 'relative',
  },
  btnText: {
    fontSize: '12px',
    userSelect: 'none',
  },
  recordingPulse: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#ef4444',
    marginRight: '6px',
    display: 'inline-block',
    animation: 'pulse 1.5s infinite',
  },
  langDropdownWrapper: {
    position: 'relative',
    display: 'inline-block',
  },
  langToggleBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    backgroundColor: 'var(--bg-hover)',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-sm, 6px)',
    fontSize: '11px',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  langCodeText: {
    fontSize: '11px',
    fontWeight: '500',
  },
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
  },
  dropdownMenu: {
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    left: 0,
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-sm, 6px)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
    zIndex: 100,
    minWidth: '180px',
    padding: '4px 0',
    overflow: 'hidden',
  },
  dropdownHeader: {
    fontSize: '10px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    padding: '6px 12px 4px',
    letterSpacing: '0.5px',
  },
  dropdownList: {
    maxHeight: '220px',
    overflowY: 'auto',
  },
  dropdownItem: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    border: 'none',
    textAlign: 'left',
    fontSize: '12px',
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  dropdownSubText: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginLeft: '8px',
  },
  unsupportedBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    backgroundColor: 'var(--bg-hover)',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px dashed var(--border-medium)',
    fontSize: '11px',
  },
  unsupportedText: {
    color: 'var(--text-muted)',
    fontSize: '11px',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    marginTop: '6px',
    padding: '6px 10px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    borderRadius: 'var(--radius-sm, 6px)',
    color: 'var(--status-error, #ef4444)',
    fontSize: '11px',
  },
};
