import React from 'react';
import styles from '../styles/RegistrationForm.module.css';

const LoadingScreen = ({ hidden }) => {
  return (
    <div 
      className={`${styles.loadingScreen} ${hidden ? styles.hidden : ''}`} 
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'var(--bg-dark)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        transition: 'opacity 0.4s ease, visibility 0.4s ease',
        opacity: hidden ? 0 : 1,
        visibility: hidden ? 'hidden' : 'visible'
      }}
    >
      <div 
        className={styles.loadingSpinner}
        aria-hidden="true"
        style={{
          width: '60px',
          height: '60px',
          border: '4px solid rgba(205, 49, 49, 0.3)',
          borderTopColor: 'var(--primary-color)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }}
      ></div>
      <div 
        className={styles.loadingText}
        style={{
          color: 'var(--text-muted)',
          fontSize: '14px',
          fontWeight: 500
        }}
      >
        Cargando sistema...
      </div>
    </div>
  );
};

export default LoadingScreen;