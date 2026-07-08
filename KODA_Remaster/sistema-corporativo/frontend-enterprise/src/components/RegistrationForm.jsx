import React, { useState, useEffect, useRef } from 'react';
import styles from '../styles/RegistrationForm.module.css';
import StepIndicator from './StepIndicator';
import FormInput from './FormInput';
import FormSelect from './FormSelect';
import LoadingScreen from './LoadingScreen';
import SuccessModal from './SuccessModal';

const RegistrationForm = () => {
  // Estados del formulario
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: '',
    masterKey: '',
    a2f: '',
    gerencia: ''
  });
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoading, setShowLoading] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState({ className: '', width: 0 });

  // Referencias para focus
  const nombreRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const masterKeyRef = useRef(null);
  const a2fRef = useRef(null);
  const gerenciaRef = useRef(null);

  // Ocultar pantalla de carga después de 800ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Calcular fortaleza de contraseña
  useEffect(() => {
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
        return { className: 'weak', width: '33%' };
      } else if (strength <= 4) {
        return { className: 'medium', width: '66%' };
      } else {
        return { className: 'strong', width: '100%' };
      }
    };

    setPasswordStrength(calculateStrength(formData.password));
  }, [formData.password]);

  // Validaciones
  const validateNombre = (value) => {
    const isValid = value.length >= 3 && value.length <= 50 && /^[a-zA-Z\sáéíóúüñÁÉÍÓÚÜÑ]+$/u.test(value);
    if (!isValid) {
      setErrors(prev => ({ ...prev, nombre: 'Por favor ingrese un nombre de usuario válido (mínimo 3 caracteres)' }));
      setSuccess(prev => ({ ...prev, nombre: '' }));
      return false;
    } else {
      setErrors(prev => ({ ...prev, nombre: '' }));
      setSuccess(prev => ({ ...prev, nombre: 'Nombre válido' }));
      return true;
    }
  };

  const validateEmail = (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]*com$/i;
    const isValid = emailRegex.test(value);
    if (!isValid) {
      setErrors(prev => ({ ...prev, email: 'Debe ser un correo electrónico válido que termine en .com' }));
      setSuccess(prev => ({ ...prev, email: '' }));
      return false;
    } else {
      setErrors(prev => ({ ...prev, email: '' }));
      setSuccess(prev => ({ ...prev, email: 'Correo válido' }));
      return true;
    }
  };

  const validatePassword = (value) => {
    const isValid = value.length >= 8;
    if (!isValid) {
      setErrors(prev => ({ ...prev, password: 'La contraseña debe tener al menos 8 caracteres' }));
      setSuccess(prev => ({ ...prev, password: '' }));
      return false;
    } else {
      setErrors(prev => ({ ...prev, password: '' }));
      setSuccess(prev => ({ ...prev, password: 'Contraseña segura' }));
      return true;
    }
  };

  const validateMasterKey = (value) => {
    const isValid = value.length >= 6;
    if (!isValid) {
      setErrors(prev => ({ ...prev, masterKey: 'La clave maestra es requerida (mínimo 6 caracteres)' }));
      setSuccess(prev => ({ ...prev, masterKey: '' }));
      return false;
    } else {
      setErrors(prev => ({ ...prev, masterKey: '' }));
      setSuccess(prev => ({ ...prev, masterKey: 'Clave maestra válida' }));
      return true;
    }
  };

  const validateA2F = (value) => {
    const isValid = /^\d{6}$/.test(value);
    if (!isValid) {
      setErrors(prev => ({ ...prev, a2f: 'El código A2F debe tener exactamente 6 dígitos numéricos' }));
      setSuccess(prev => ({ ...prev, a2f: '' }));
      return false;
    } else {
      setErrors(prev => ({ ...prev, a2f: '' }));
      setSuccess(prev => ({ ...prev, a2f: 'Código A2F válido' }));
      return true;
    }
  };

  const validateGerencia = (value) => {
    const isValid = value !== '';
    if (!isValid) {
      setErrors(prev => ({ ...prev, gerencia: 'Por favor seleccione una gerencia' }));
      setSuccess(prev => ({ ...prev, gerencia: '' }));
      return false;
    } else {
      setErrors(prev => ({ ...prev, gerencia: '' }));
      setSuccess(prev => ({ ...prev, gerencia: 'Gerencia seleccionada' }));
      return true;
    }
  };

  const validateStep1 = () => {
    const nombreValid = validateNombre(formData.nombre);
    const emailValid = validateEmail(formData.email);
    const passwordValid = validatePassword(formData.password);
    return nombreValid && emailValid && passwordValid;
  };

  const validateStep2 = () => {
    const masterKeyValid = validateMasterKey(formData.masterKey);
    const a2fValid = validateA2F(formData.a2f);
    const gerenciaValid = validateGerencia(formData.gerencia);
    return masterKeyValid && a2fValid && gerenciaValid;
  };

  // Manejadores de eventos
  const handleChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleNext = () => {
    if (validateStep1()) {
      setCurrentStep(2);
      setTimeout(() => {
        if (masterKeyRef.current) masterKeyRef.current.focus();
      }, 300);
    }
  };

  const handlePrev = () => {
    setCurrentStep(1);
    setTimeout(() => {
      if (passwordRef.current) passwordRef.current.focus();
    }, 300);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    
    if (validateStep2()) {
      setIsSubmitting(true);
      
      // Simular envío asíncrono
      setTimeout(() => {
        setShowSuccessModal(true);
        setFormData({
          nombre: '',
          email: '',
          password: '',
          masterKey: '',
          a2f: '',
          gerencia: ''
        });
        setErrors({});
        setSuccess({});
        setCurrentStep(1);
        setIsSubmitting(false);
      }, 1500);
    }
  };

  const handleCloseModal = () => {
    setShowSuccessModal(false);
  };

  const handleKeyDown = (field, e) => {
    if (e.key === 'Enter') {
      switch(field) {
        case 'nombre':
          if (validateNombre(formData.nombre)) {
            emailRef.current?.focus();
          }
          break;
        case 'email':
          if (validateEmail(formData.email)) {
            passwordRef.current?.focus();
          }
          break;
        case 'password':
          if (validatePassword(formData.password)) {
            handleNext();
          }
          break;
        case 'masterKey':
          if (validateMasterKey(formData.masterKey)) {
            a2fRef.current?.focus();
          }
          break;
        case 'a2f':
          if (validateA2F(formData.a2f)) {
            gerenciaRef.current?.focus();
          }
          break;
        case 'gerencia':
          if (validateGerencia(formData.gerencia)) {
            handleSubmit(e);
          }
          break;
        default:
          break;
      }
    }
  };

  const handlePasteA2F = (e) => {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text');
    const filteredValue = paste.replace(/[^0-9]/g, '').slice(0, 6);
    setFormData(prev => ({ ...prev, a2f: filteredValue }));
    validateA2F(filteredValue);
  };

  // Opciones del select de gerencia
  const gerenciaOptions = [
    { value: '', label: 'Seleccione departamento...', disabled: true },
    { value: 'g1', label: 'Gerencia de Operaciones' },
    { value: 'g2', label: 'Gerencia de Finanzas' },
    { value: 'g3', label: 'Gerencia de Tecnología' },
    { value: 'g4', label: 'Gerencia de Recursos Humanos' },
    { value: 'g5', label: 'Gerencia Comercial' },
    { value: 'g6', label: 'Gerencia de Proyectos' },
    { value: 'g7', label: 'Gerencia Legal' }
  ];

  return (
    <>
      <LoadingScreen hidden={!showLoading} />
      
      <div className={styles.container}>
        <div className={styles.badgeAdmin} role="status">
          <i className="fas fa-shield-alt" aria-hidden="true"></i> ACCESO ADMINISTRATIVO
        </div>
        
        <div className={styles.logoContainer}>
          <div
            aria-label="Identidad KODA Remaster"
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              overflow: 'hidden',
              boxShadow: '0 20px 50px rgba(30, 41, 59, 0.24)',
            }}
          >
            <img
              src="/koda-mark.webp"
              alt="KODA"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
          <div 
            className={styles.logoBadge} 
            data-tooltip="Nivel de acceso: Administrador" 
            aria-label="Nivel de acceso: Administrador"
          >
            <i className="fas fa-user-shield" aria-hidden="true"></i>
          </div>
        </div>
        
        <h1>Registro Corporativo</h1>
        <p className={styles.subtitle}>
          Usted está en un formulario de uso <strong>Administrativo</strong>. Complete el formulario para registrar un
          usuario al sistema de gestión corporativa.
        </p>
        
        <StepIndicator currentStep={currentStep} />
        
        <form id="registrationForm" noValidate onSubmit={handleSubmit}>
          {/* Paso 1: Datos básicos */}
          <div className={`${styles.stepContainer} ${currentStep === 1 ? styles.active : ''}`} role="group">
            <FormInput
              id="nombre"
              label="Registra un usuario"
              type="text"
              placeholder="Nombre completo"
              value={formData.nombre}
              onChange={handleChange}
              error={errors.nombre}
              success={success.nombre}
              iconClass="fas fa-user"
              required={true}
              minLength={3}
              maxLength={50}
              onKeyDown={(e) => handleKeyDown('nombre', e)}
              ref={nombreRef}
            />
            
            <FormInput
              id="email"
              label="Registra un correo electrónico"
              type="email"
              placeholder="usuario@dominio.com"
              value={formData.email}
              onChange={handleChange}
              error={errors.email}
              success={success.email}
              iconClass="fas fa-envelope"
              required={true}
              onKeyDown={(e) => handleKeyDown('email', e)}
              ref={emailRef}
            />
            
            <FormInput
              id="password"
              label="Registra una contraseña"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              error={errors.password}
              success={success.password}
              iconClass="fas fa-lock"
              required={true}
              minLength={8}
              showPasswordToggle={true}
              passwordStrength={{
                className: passwordStrength.className,
                width: passwordStrength.width
              }}
              onKeyDown={(e) => handleKeyDown('password', e)}
              ref={passwordRef}
            />
            
            <div className={styles.buttonGroup}>
              <button 
                type="button" 
                className={`${styles.btn} ${styles.btnPrimary}`} 
                onClick={handleNext}
              >
                <i className="fas fa-arrow-right" aria-hidden="true"></i> Siguiente
              </button>
            </div>
          </div>
          
          {/* Paso 2: Datos de seguridad */}
          <div className={`${styles.stepContainer} ${currentStep === 2 ? styles.active : ''}`} role="group">
            <FormInput
              id="masterKey"
              label="Clave Maestra"
              type="password"
              placeholder="••••••••"
              value={formData.masterKey}
              onChange={handleChange}
              error={errors.masterKey}
              success={success.masterKey}
              iconClass="fas fa-key"
              required={true}
              minLength={6}
              showPasswordToggle={true}
              onKeyDown={(e) => handleKeyDown('masterKey', e)}
              ref={masterKeyRef}
            />
            
            <FormInput
              id="a2f"
              label="Clave A2F"
              type="text"
              placeholder="123456"
              value={formData.a2f}
              onChange={handleChange}
              error={errors.a2f}
              success={success.a2f}
              iconClass="fas fa-shield-alt"
              required={true}
              maxLength={6}
              minLength={6}
              pattern="[0-9]*"
              inputMode="numeric"
              onKeyDown={(e) => handleKeyDown('a2f', e)}
              onPaste={handlePasteA2F}
              ref={a2fRef}
            />
            
            <FormSelect
              id="gerencia"
              label="Gerencia"
              value={formData.gerencia}
              onChange={handleChange}
              error={errors.gerencia}
              success={success.gerencia}
              iconClass="fas fa-building"
              required={true}
              options={gerenciaOptions}
              onKeyDown={(e) => handleKeyDown('gerencia', e)}
              ref={gerenciaRef}
            />
            
            <div className={styles.buttonGroup}>
              <button 
                type="button" 
                className={`${styles.btn} ${styles.btnSecondary}`} 
                onClick={handlePrev}
              >
                <i className="fas fa-arrow-left" aria-hidden="true"></i> Atrás
              </button>
              <button 
                type="submit" 
                className={`${styles.btn} ${styles.btnPrimary} ${isSubmitting ? styles.btnLoading : ''}`}
                disabled={isSubmitting}
              >
                <span className={styles.btnText}>
                  <i className="fas fa-check" aria-hidden="true"></i> Finalizar Registro
                </span>
              </button>
            </div>
          </div>
        </form>
        
        <div className={styles.footerText}>
          <strong>KODA REMASTER</strong> - Sistema de Gestión Corporativa 2026<br />
          Todos los derechos reservados (en Desarrollo por Code_By3lo).
        </div>
      </div>
      
      {showSuccessModal && <SuccessModal onClose={handleCloseModal} />}
    </>
  );
};

export default RegistrationForm;
