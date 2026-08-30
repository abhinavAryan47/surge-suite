import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, Volume2, Globe } from 'lucide-react';
import { useSpeechSynthesis, detectScriptLanguage } from '../hooks/useSpeechSynthesis';
import { VOICE_LANGUAGES } from '../hooks/useVoiceRecognition';

export default function AudioResponsePlayer({
  text,
  defaultLang = 'en-IN',
  compact = false,
  label = 'Listen',
}) {
  const { speak, pause, resume, cancel, isSpeaking, isPaused, isSupported } = useSpeechSynthesis();
  const [selectedLang, setSelectedLang] = useState(defaultLang);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (defaultLang) {
      setSelectedLang(defaultLang);
    }
  }, [defaultLang]);

  if (!isSupported) {
    return null;
  }

  const detectedLang = detectScriptLanguage(text);
  const effectiveLang = (selectedLang === 'en-IN' || selectedLang === 'en-US') && detectedLang ? detectedLang : selectedLang;

  const currentLangObj =
    VOICE_LANGUAGES.find((l) => l.code === effectiveLang) || VOICE_LANGUAGES[0];

  const handlePlayToggle = (e) => {
    if (e) e.preventDefault();
    if (!text || !text.trim()) return;

    if (isSpeaking) {
      if (isPaused) {
        resume();
      } else {
        pause();
      }
    } else {
      speak(text, effectiveLang);
    }
  };

  const handleStop = (e) => {
    if (e) e.preventDefault();
    cancel();
  };

  const handleLanguageChange = (code) => {
    setSelectedLang(code);
    setDropdownOpen(false);
    if (isSpeaking) {
      cancel();
      setTimeout(() => {
        speak(text, code);
      }, 100);
    }
  };

  // Compact Mode (for toolbars or next to input fields)
  if (compact) {
    if (!text || !text.trim()) return null;
    return (
      <div style={styles.compactContainer}>
        <button
          type="button"
          onClick={handlePlayToggle}
          title={isSpeaking && !isPaused ? 'Pause reading aloud' : `Read text aloud in ${currentLangObj.nativeLabel}`}
          style={{
            ...styles.compactBtn,
            backgroundColor: isSpeaking ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-hover)',
            borderColor: isSpeaking ? 'var(--status-info, #3b82f6)' : 'var(--border-medium)',
            color: isSpeaking ? 'var(--status-info, #3b82f6)' : 'var(--text-primary)',
          }}
        >
          {isSpeaking && !isPaused ? (
            <>
              <Pause size={13} style={{ marginRight: '5px' }} />
              <span>Pause Audio</span>
            </>
          ) : (
            <>
              <Volume2 size={13} style={{ marginRight: '5px' }} />
              <span>{isPaused ? 'Resume' : label}</span>
            </>
          )}
        </button>

        {isSpeaking && (
          <button
            type="button"
            onClick={handleStop}
            title="Stop audio"
            style={styles.compactStopBtn}
          >
            <Square size={11} />
          </button>
        )}
      </div>
    );
  }

  // Full Header Player Bar (for Result Card)
  return (
    <div style={styles.container}>
      <div style={styles.leftGroup}>
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={handlePlayToggle}
          disabled={!text || !text.trim()}
          title={isSpeaking && !isPaused ? 'Pause reading aloud' : `Read AI response aloud in ${currentLangObj.label}`}
          style={{
            ...styles.controlBtn,
            backgroundColor: isSpeaking ? 'var(--text-primary)' : 'var(--bg-card)',
            color: isSpeaking ? 'var(--bg-card)' : 'var(--text-primary)',
            opacity: !text ? 0.6 : 1,
            cursor: !text ? 'not-allowed' : 'pointer',
          }}
        >
          {isSpeaking && !isPaused ? (
            <>
              <Pause size={13} style={{ marginRight: '6px' }} />
              <span>Pause Audio</span>
            </>
          ) : (
            <>
              <Volume2 size={13} style={{ marginRight: '6px' }} />
              <span>{isPaused ? 'Resume Voice' : 'Listen to AI Response'}</span>
            </>
          )}
        </button>

        {/* Stop Button */}
        {isSpeaking && (
          <button
            type="button"
            onClick={handleStop}
            title="Stop audio playback"
            style={styles.stopBtn}
          >
            <Square size={11} style={{ marginRight: '4px' }} />
            <span>Stop</span>
          </button>
        )}

        {/* Active Audio Waveform Animation */}
        {isSpeaking && !isPaused && (
          <div style={styles.waveformContainer} title="Speaking AI Response...">
            <span style={{ ...styles.waveBar, animationDelay: '0s' }} />
            <span style={{ ...styles.waveBar, animationDelay: '0.2s' }} />
            <span style={{ ...styles.waveBar, animationDelay: '0.4s' }} />
            <span style={{ ...styles.waveBar, animationDelay: '0.1s' }} />
          </div>
        )}
      </div>

      {/* Language Voice Selector */}
      <div style={styles.rightGroup}>
        <div style={styles.langWrapper}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            title="Select Voice Language"
            style={styles.langBtn}
          >
            <Globe size={12} style={{ marginRight: '5px', color: 'var(--text-muted)' }} />
            <span>Voice: <strong>{currentLangObj.nativeLabel}</strong></span>
          </button>

          {dropdownOpen && (
            <>
              <div style={styles.backdrop} onClick={() => setDropdownOpen(false)} />
              <div style={styles.dropdownMenu}>
                <div style={styles.dropdownHeader}>Select Voice Language</div>
                <div style={styles.dropdownList}>
                  {VOICE_LANGUAGES.map((lang) => {
                    const isSelected = lang.code === selectedLang;
                    return (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => handleLanguageChange(lang.code)}
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
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 14px',
    backgroundColor: 'var(--bg-hover)',
    borderBottom: '1px solid var(--border-medium)',
    fontSize: '12px',
    flexWrap: 'wrap',
    gap: '8px',
  },
  compactContainer: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  compactBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  compactStopBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 8px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: 'var(--status-error, #ef4444)',
    cursor: 'pointer',
  },
  leftGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  controlBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid var(--border-medium)',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  stopBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 9px',
    borderRadius: 'var(--radius-sm, 6px)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: 'var(--status-error, #ef4444)',
    fontSize: '11px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  waveformContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    height: '14px',
    marginLeft: '6px',
  },
  waveBar: {
    width: '3px',
    height: '12px',
    backgroundColor: 'var(--text-primary)',
    borderRadius: '2px',
    animation: 'waveform 0.8s ease-in-out infinite alternate',
  },
  langWrapper: {
    position: 'relative',
  },
  langBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 10px',
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-sm, 6px)',
    fontSize: '11px',
    color: 'var(--text-primary)',
    cursor: 'pointer',
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
    right: 0,
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--border-medium)',
    borderRadius: 'var(--radius-sm, 6px)',
    boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
    zIndex: 100,
    minWidth: '190px',
    padding: '4px 0',
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
    padding: '6px 12px',
    border: 'none',
    textAlign: 'left',
    fontSize: '11px',
    cursor: 'pointer',
  },
  dropdownSubText: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    marginLeft: '8px',
  },
};
