import React, { useState, useEffect } from 'react';
import styles from '../styles/RegistrationForm.module.css';

const FormInput = ({ 
  id, 
  label, 
  type = 'text', 
  placeholder, 
  value, 
  onChange, 
  error, 
  success, 
  iconClass,
  showPasswordToggle = false,
  passwordStrength = null,
  required = false,
  minLength,
  maxLength,
  pattern,
  inputMode,
  onKeyDown,
  onPaste
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [localValue, setLocalValue] = useState(value || '');

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleTogglePassword = () => {
    setShowPassword(!showPassword);
  };

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(e);
  };

  const handleKeyDown = (e) => {
    if (onKeyDown) onKeyDown(e);
  };

  const handlePaste = (e) => {
    if (onPaste) {
      onPaste(e);
    } else {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text');
      const filteredValue = paste.replace(/[^0-9]/g, '').slice(0, 6);
      setLocalValue(filteredValue);
      onChange({ target: { id, value: filteredValue } });
    }
  };

  return (
    <div className={styles.formGroup}>
      <label htmlFor={id}>
        <i className={iconClass} aria-hidden="true"></i> {label}
      </label>
      <i 
        className={`${styles.formGroupIcon} ${error ? styles.invalid : ''} ${success ? styles.valid : ''}`} 
        id={`${id}-icon`}
        aria-hidden="true"
      ></i>
      <input
        type={showPasswordToggle && showPassword ? 'text' : type}
        id={id}
        name={id}
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        pattern={pattern}
        inputMode={inputMode}
        className={`${error ? styles.invalid : ''} ${success ? styles.valid : ''}`}
        aria-describedby={`${id}-error ${id}-success ${passwordStrength ? `${id}Strength` : ''}`}
        aria-invalid={error ? 'true' : 'false'}
      />
      {showPasswordToggle && (
        <button 
          type="button" 
          className={styles.passwordToggle} 
          onClick={handleTogglePassword}
          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={showPassword ? 'true' : 'false'}
        >
          <i className={showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'} aria-hidden="true"></i>
        </button>
      )}
      {passwordStrength && (
        <div 
          className={`${styles.passwordStrength} ${passwordStrength.className || ''}`} 
          id={`${id}Strength`} 
          aria-live="polite"
        >
          <div 
            className={styles.passwordStrengthBar} 
            id={`${id}StrengthBar`}
            style={{ width: passwordStrength.width || 0 }}
          ></div>
        </div>
      )}
      {error && (
        <div className={`${styles.errorMessage} ${styles.show}`} id={`${id}-error`} role="alert">
          <i className="fas fa-exclamation-circle" aria-hidden="true"></i>
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className={`${styles.successMessage} ${styles.show}`} id={`${id}-success`} role="status">
          <i className="fas fa-check-circle" aria-hidden="true"></i>
          <span>{success}</span>
        </div>
      )}
    </div>
  );
};

export default FormInput;