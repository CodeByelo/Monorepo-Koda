import React from 'react';

const SuccessModal = ({ onClose }) => {
  return (
    <div 
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        animation: 'fadeIn 0.3s ease'
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div style={{
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        border: '2px solid var(--primary-color)',
        borderRadius: '20px',
        padding: '40px',
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%',
        boxShadow: '0 10px 40px rgba(205, 49, 49, 0.4)',
        animation: 'slideUp 0.4s ease'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          margin: '0 auto 20px',
          background: 'rgba(39, 174, 96, 0.15)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '3px solid var(--success-color)'
        }}>
          <i className="fas fa-check" style={{
            color: 'var(--success-color)',
            fontSize: '36px'
          }} aria-hidden="true"></i>
        </div>
        <h3 id="success-modal-title" style={{
          color: 'var(--text-main)',
          fontSize: '24px',
          marginBottom: '12px',
          fontWeight: 700
        }}>
          ¡Registro Exitoso!
        </h3>
        <p style={{
          color: 'var(--text-muted)',
          fontSize: '15px',
          marginBottom: '24px',
          lineHeight: 1.6
        }}>
          El usuario ha sido registrado correctamente en el sistema corporativo.
        </p>
        <button 
          id="modalCloseBtn"
          onClick={onClose}
          style={{
            background: 'linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%)',
            color: 'white',
            border: 'none',
            padding: '12px 32px',
            borderRadius: '12px',
            fontSize: '16px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
          autoFocus
        >
          Aceptar
        </button>
      </div>
    </div>
  );
};

export default SuccessModal;