import React, { useState, useEffect } from 'react';
import styles from '../styles/RegistrationForm.module.css';

const FormSelect = ({ 
  id, 
  label, 
  value, 
  onChange, 
  error, 
  success, 
  iconClass,
  options,
  required = false
}) => {
  const [localValue, setLocalValue] = useState(value || '');

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(e);
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
      <select
        id={id}
        name={id}
        value={localValue}
        onChange={handleChange}
        required={required}
        className={`${error ? styles.invalid : ''} ${success ? styles.valid : ''}`}
        aria-describedby={`${id}-error ${id}-success`}
        aria-invalid={error ? 'true' : 'false'}
      >
        {options.map((option) => (
          <option 
            key={option.value} 
            value={option.value} 
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
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

export default FormSelect;