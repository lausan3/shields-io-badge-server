# 🔥 lausan's Shields IO Badges

Hi! If you're here, you're probably a beta tester for my dynamic Spotify badge server!

I made this because I found one on [@tandpfun's](https://github.com/tandpfun) GitHub profile and couldn't find any public service that let me have one, so I made my own.

Keep reading to get started!

# Get Started

To use this service, visit [this link](https://lausan-badge-server-10c6eb697973.herokuapp.com/spotify/authorize) and follow the steps to authorize some data that I need using your Spotify account (I only need your recently played songs and Spotify id).

After you're done, go to [Shields.io](https://shields.io/badges/endpoint-badge) and make a link from [here](https://github.com/lausan3/shields-io-badge-server/edit/main/README.md#available-badges) and customize your badge to your hearts content!

Next, find your Spotify ID (the username you log in with). If you don't know it, you can go to your Spotify profile and the bit after ```/user/``` is your ID. Use this so the server can display YOUR information.
![example](https://github.com/user-attachments/assets/1bc83a5b-6dfc-4ee9-8f72-0a5a1749f06a)

Note: Your ID cannot have ```?``` or ```/``` in it, so don't include those.

You can use this badge on GitHub or anywhere Shields.io is supported.


# Available Badges
## Last Played Song
Display your last played song!

Link format: ```https://lausan-badge-server-10c6eb697973.herokuapp.com/spotify/lastplayed/<YOUR SPOTIFY ID>```

Example: 

![Last Played Song Badge](https://img.shields.io/endpoint?url=https%3A%2F%2Flausan-badge-server-10c6eb697973.herokuapp.com%2Fspotify%2Flastplayed%2Fanthonylaus&style=for-the-badge&logo=spotify&labelColor=black&color=gray)
