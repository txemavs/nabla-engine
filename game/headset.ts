/** Host navigation only: the launcher does not load the engine or any models. */
const place = document.querySelector<HTMLSelectElement>('#xr-place')!
const ride = document.querySelector<HTMLAnchorElement>('#ride-xr')!
const update = () => {
  const query = new URLSearchParams({ xr: '1', solo: '1', vehicle: 'vfr800', quality: 'minimal' })
  if (place.value === 'z15') {
    for (const [key, value] of Object.entries({
      terrain: '/terrain',
      tile: '16224/11998',
      photo: 'lo',
      relief: 'engine',
      time: '12:00',
    }))
      query.set(key, value)
  } else query.set('example', 'flat')
  ride.href = `/xr.html?${query}`
}
place.addEventListener('change', update)
window.addEventListener('pageshow', update)
update()
export {}
