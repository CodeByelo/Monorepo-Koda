import React from 'react';
import styles from '../styles/RegistrationForm.module.css';

const PasswordStrength = ({ password }) => {
  const calculateStrength = (pwd) => {
    if (!pwd || pwd.length === 0) return { className: '', width: 0 };
    
    let strength = 0;
    if (pwd.length >= 8) strength++;
    if (pwd.length >= 12) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[a-z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^A-Za-z0-9]/.test(pwd)) strength++;

    if (strength <= 2) {
      return { className: styles.weak, width: '33%' };
    } else if (strength <= 4) {
      return { className: styles.medium, width: '66%' };
    } else {
      return { className: styles.strong, width: '100%' };
    }
  };

  const strength = calculateStrength(password);

  return (
    <div 
      className={`${styles.passwordStrength} ${strength.className}`} 
      aria-live="polite"
    >
      <div 
        className={styles.passwordStrengthBar} 
        style={{ width: strength.width }}
      ></div>
    </div>
  );
};

export default PasswordStrength;