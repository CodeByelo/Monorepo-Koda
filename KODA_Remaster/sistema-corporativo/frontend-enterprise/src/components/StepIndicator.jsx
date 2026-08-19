import React from 'react';
import styles from '../styles/RegistrationForm.module.css';

const StepIndicator = ({ currentStep }) => {
  return (
    <div 
      className={styles.stepIndicator}
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '120px',
        marginBottom: '36px',
        marginTop: '10px',
        position: 'relative'
      }}
    >
      <div 
        className={`${styles.stepDot} ${currentStep === 1 ? styles.active : ''} ${currentStep > 1 ? styles.completed : ''}`}
        id="step1-dot"
        aria-current={currentStep === 1 ? 'step' : undefined}
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: currentStep === 1 ? 'var(--primary-color)' : currentStep > 1 ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.2)',
          border: currentStep === 1 ? '2px solid var(--primary-color)' : currentStep > 1 ? '2px solid var(--primary-color)' : '2px solid rgba(255, 255, 255, 0.3)',
          position: 'relative',
          zIndex: 1,
          transition: 'all 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: currentStep === 1 ? 'scale(1.2)' : 'none',
          boxShadow: currentStep === 1 ? '0 0 15px rgba(205, 49, 49, 0.4)' : 'none'
        }}
      >
        <span 
          className={styles.stepLabel}
          style={{
            position: 'absolute',
            top: '24px',
            left: '5%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            fontSize: '13px',
            color: currentStep === 1 ? 'var(--primary-light)' : currentStep > 1 ? 'var(--primary-color)' : 'var(--text-muted)',
            fontWeight: currentStep === 1 ? 700 : 500,
            transition: 'all 0.3s ease'
          }}
        >
          Paso 1
        </span>
        {currentStep > 1 && (
          <div 
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'white',
              position: 'absolute'
            }}
          ></div>
        )}
        {currentStep === 1 && (
          <div 
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'white',
              position: 'absolute'
            }}
          ></div>
        )}
      </div>
      
      <div 
        className={`${styles.stepDot} ${currentStep === 2 ? styles.active : ''} ${currentStep > 2 ? styles.completed : ''}`}
        id="step2-dot"
        aria-current={currentStep === 2 ? 'step' : undefined}
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: currentStep === 2 ? 'var(--primary-color)' : currentStep > 2 ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.2)',
          border: currentStep === 2 ? '2px solid var(--primary-color)' : currentStep > 2 ? '2px solid var(--primary-color)' : '2px solid rgba(255, 255, 255, 0.3)',
          position: 'relative',
          zIndex: 1,
          transition: 'all 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: currentStep === 2 ? 'scale(1.2)' : 'none',
          boxShadow: currentStep === 2 ? '0 0 15px rgba(205, 49, 49, 0.4)' : 'none'
        }}
      >
        <span 
          className={styles.stepLabel}
          style={{
            position: 'absolute',
            top: '24px',
            left: '5%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            fontSize: '13px',
            color: currentStep === 2 ? 'var(--primary-light)' : currentStep > 2 ? 'var(--primary-color)' : 'var(--text-muted)',
            fontWeight: currentStep === 2 ? 700 : 500,
            transition: 'all 0.3s ease'
          }}
        >
          Paso 2
        </span>
        {currentStep > 2 && (
          <div 
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'white',
              position: 'absolute'
            }}
          ></div>
        )}
        {currentStep === 2 && (
          <div 
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'white',
              position: 'absolute'
            }}
          ></div>
        )}
      </div>
      
      <div 
        style={{
          content: '""',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '120px',
          height: '2px',
          background: 'rgba(255, 255, 255, 0.15)',
          zIndex: 0
        }}
      ></div>
    </div>
  );
};

export default StepIndicator;