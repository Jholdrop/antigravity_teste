const LoadingScreen = ({ message = 'Carregando...' }) => {
  return (
    <div className="loading-screen">
      <div className="loader-ring">
        <div />
        <div />
        <div />
        <div />
      </div>
      <p>{message}</p>
    </div>
  );
};

export default LoadingScreen;
